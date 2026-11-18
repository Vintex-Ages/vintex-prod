# Produção do Vintex (ADR 0003): ECS/Fargate atrás de CloudFront e API Gateway,
# RDS privado, mídia em S3 e IA assíncrona. State próprio, separado da staging.
locals {
  aws_region = "us-east-2"
  name       = "vintex-production"
  zones      = ["${local.aws_region}a", "${local.aws_region}b"]
  api_port   = 8000
}

provider "aws" {
  region              = local.aws_region
  allowed_account_ids = [var.expected_account_id]
  default_tags {
    tags = {
      Project     = "Vintex"
      Environment = var.deployment
      ManagedBy   = "Terraform"
    }
  }
}

# Rede: subnets públicas para as tasks (IP de saída, sem NAT e sem ingress
# público) e o VPC Link; o RDS fica em subnets sem rota para a internet.
module "network" {
  source              = "../modules/network"
  name_prefix         = local.name
  vpc_cidr            = "10.90.0.0/16"
  availability_zones  = local.zones
  public_subnet_cidrs = ["10.90.1.0/24", "10.90.2.0/24"]
  api_port            = local.api_port
}

resource "aws_subnet" "data" {
  for_each          = { for index, zone in local.zones : zone => "10.90.${11 + index}.0/24" }
  vpc_id            = module.network.vpc_id
  availability_zone = each.key
  cidr_block        = each.value
  tags              = { Name = "${local.name}-data-${each.key}" }
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.data : subnet.id]
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "Postgres acessivel somente pela API e pelo worker"
  vpc_id      = module.network.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_app" {
  for_each = {
    api    = module.network.api_security_group_id
    worker = module.network.worker_security_group_id
  }
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Postgres a partir da ${each.key}"
}

resource "aws_vpc_security_group_egress_rule" "app_to_database" {
  for_each = {
    api    = module.network.api_security_group_id
    worker = module.network.worker_security_group_id
  }
  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.database.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Postgres de producao"
}

# Senha sem caracteres especiais: entra inteira na DATABASE_URL.
resource "random_password" "database" {
  length  = 40
  special = false
}

resource "aws_db_parameter_group" "this" {
  name   = local.name
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                      = local.name
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = "db.t4g.micro"
  allocated_storage               = 20
  max_allocated_storage           = 50
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "vintex"
  username                        = "vintex"
  password                        = random_password.database.result
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  parameter_group_name            = aws_db_parameter_group.this.name
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = 7
  backup_window                   = "06:00-07:00" # 03h–04h em Brasília
  maintenance_window              = "sun:07:30-sun:08:30"
  auto_minor_version_upgrade      = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"
  copy_tags_to_snapshot           = true
  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

# Mídia e fila: mesmos contratos da staging, nomes da produção.
module "media" {
  source      = "../modules/media_storage"
  bucket_name = "vintex-media-production-${var.expected_account_id}"
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = module.media.bucket_name
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_policy" "media_tls" {
  bucket = module.media.bucket_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = ["arn:aws:s3:::${module.media.bucket_name}", "arn:aws:s3:::${module.media.bucket_name}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

module "messaging" {
  source                        = "../modules/ai_messaging"
  processing_queue_name         = "vintex-ai-production"
  dead_letter_queue_name        = "vintex-ai-production-dlq"
  max_receive_count             = 3
  visibility_timeout_seconds    = 180
  receive_wait_time_seconds     = 20
  dead_letter_retention_seconds = 1209600
}

# Imagens: os repositórios são da staging (mesmo SHA promovido).
data "aws_ecr_repository" "backend" {
  name = "vintex-backend"
}

data "aws_ecr_repository" "freellmapi" {
  name = "freellmapi"
}
