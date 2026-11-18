# Aplicação: segredos, logs, ECS (API contínua e worker de 0 a 1 com o
# FreeLLMAPI como sidecar), EFS do SQLite do gateway e Cloud Map.

# --- Segredos (Secrets Manager) -------------------------------------------
resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_id" "llm_encryption_key" {
  byte_length = 32
}

resource "random_password" "llm_admin" {
  length  = 32
  special = false
}

locals {
  generated_secrets = {
    database_url = "postgresql://vintex:${random_password.database.result}@${aws_db_instance.this.address}:5432/vintex?sslmode=require"
    jwt_secret   = random_password.jwt.result
    # Estável: o SQLite do FreeLLMAPI só abre com a mesma chave.
    llm_encryption_key = random_id.llm_encryption_key.hex
    llm_config_json = jsonencode({
      admin = { email = "admin@vintex-ages.app", password = random_password.llm_admin.result }
    })
  }
}

resource "aws_secretsmanager_secret" "generated" {
  for_each                = local.generated_secrets
  name                    = "/vintex/production/${each.key}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "generated" {
  for_each      = local.generated_secrets
  secret_id     = aws_secretsmanager_secret.generated[each.key].id
  secret_string = each.value
}

# Token unificado do FreeLLMAPI: criado no dashboard depois do primeiro deploy e
# gravado à mão. O Terraform cria o segredo vazio e não volta o valor.
resource "aws_secretsmanager_secret" "llm_api_key" {
  name                    = "/vintex/production/llm_api_key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "llm_api_key" {
  secret_id     = aws_secretsmanager_secret.llm_api_key.id
  secret_string = "REPLACE_MANUALLY_AFTER_FIRST_DEPLOY"
  lifecycle { ignore_changes = [secret_string] }
}

locals {
  secret_arn = merge(
    { for key, secret in aws_secretsmanager_secret.generated : key => secret.arn },
    { llm_api_key = aws_secretsmanager_secret.llm_api_key.arn }
  )
  public_url   = "https://${aws_cloudfront_distribution.this.domain_name}"
  backend_repo = data.aws_ecr_repository.backend.repository_url
  common_environment = [
    { name = "APP_ENV", value = "production" },
    { name = "APP_DEBUG", value = "false" },
    { name = "AWS_REGION", value = local.aws_region },
    { name = "AI_ANALYSIS_QUEUE_URL", value = module.messaging.processing_queue_url },
    { name = "MEDIA_BUCKET", value = module.media.bucket_name },
    { name = "PUBLIC_BASE_URL", value = local.public_url },
    { name = "CORS_ORIGINS", value = local.public_url },
    # IA só assíncrona na produção (ADR 0003, decisão 2).
    { name = "AI_PROVIDER", value = "unavailable" },
  ]
  common_secrets = [
    { name = "DATABASE_URL", valueFrom = local.secret_arn["database_url"] },
    { name = "JWT_SECRET", valueFrom = local.secret_arn["jwt_secret"] },
  ]
}

# --- Logs -----------------------------------------------------------------
resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "worker", "freellmapi", "migrate", "apigateway"])
  name              = "/vintex/production/${each.key}"
  retention_in_days = 14
}

# --- ECS --------------------------------------------------------------------
resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.expected_account_id]
    }
  }
}

locals {
  execution_secrets = {
    api    = ["database_url", "jwt_secret"]
    worker = ["database_url", "jwt_secret", "llm_api_key", "llm_encryption_key", "llm_config_json"]
  }
}

# Uma execution role por task: o ECS injeta em cada uma só os segredos dela.
resource "aws_iam_role" "execution" {
  for_each           = local.execution_secrets
  name               = "VintexProduction${title(each.key)}TaskExecutionRole"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  for_each   = aws_iam_role.execution
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  for_each = local.execution_secrets
  name     = "secrets"
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [for name in each.value : local.secret_arn[name]]
    }]
  })
}

resource "aws_iam_role" "task" {
  for_each           = toset(["api", "worker"])
  name               = "VintexProduction${title(each.key)}TaskRole"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

locals {
  media_arn = "arn:aws:s3:::${module.media.bucket_name}"
  # ECS Exec (operação: seeds, conta de admin, dashboard do FreeLLMAPI).
  ecs_exec_statement = {
    Sid      = "EcsExec"
    Effect   = "Allow"
    Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
    Resource = "*"
  }
}

resource "aws_iam_role_policy" "api" {
  name = "api"
  role = aws_iam_role.task["api"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "ListMedia", Effect = "Allow", Action = ["s3:ListBucket"], Resource = local.media_arn },
      { Sid = "MediaObjects", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.media_arn}/*" },
      { Sid = "EnqueueAnalysis", Effect = "Allow", Action = ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"], Resource = module.messaging.processing_queue_arn },
      local.ecs_exec_statement,
    ]
  })
}

resource "aws_iam_role_policy" "worker" {
  name = "worker"
  role = aws_iam_role.task["worker"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "ReadMedia", Effect = "Allow", Action = ["s3:GetObject"], Resource = "${local.media_arn}/*" },
      { Sid = "ConsumeAnalysis", Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"], Resource = module.messaging.processing_queue_arn },
      {
        Sid       = "GatewayData"
        Effect    = "Allow"
        Action    = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
        Resource  = aws_efs_file_system.llm.arn
        Condition = { StringEquals = { "elasticfilesystem:AccessPointArn" = aws_efs_access_point.llm.arn } }
      },
      local.ecs_exec_statement,
    ]
  })
}

# --- EFS do FreeLLMAPI ------------------------------------------------------
resource "aws_efs_file_system" "llm" {
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"
  lifecycle_policy { transition_to_ia = "AFTER_30_DAYS" }
  tags = { Name = "${local.name}-freellmapi" }
}

resource "aws_efs_backup_policy" "llm" {
  file_system_id = aws_efs_file_system.llm.id
  backup_policy { status = "ENABLED" }
}

resource "aws_security_group" "efs" {
  name        = "${local.name}-efs"
  description = "NFS somente a partir do worker"
  vpc_id      = module.network.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "efs_from_worker" {
  security_group_id            = aws_security_group.efs.id
  referenced_security_group_id = module.network.worker_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
  description                  = "NFS do worker"
}

resource "aws_vpc_security_group_egress_rule" "worker_to_efs" {
  security_group_id            = module.network.worker_security_group_id
  referenced_security_group_id = aws_security_group.efs.id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
  description                  = "NFS do SQLite do FreeLLMAPI"
}

resource "aws_efs_mount_target" "llm" {
  count           = length(local.zones)
  file_system_id  = aws_efs_file_system.llm.id
  subnet_id       = values(module.network.egress_subnet_ids)[count.index]
  security_groups = [aws_security_group.efs.id]
}

# O FreeLLMAPI roda como root e grava em /app/server/data.
resource "aws_efs_access_point" "llm" {
  file_system_id = aws_efs_file_system.llm.id
  posix_user {
    uid = 0
    gid = 0
  }
  root_directory {
    path = "/freellmapi"
    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "0700"
    }
  }
}

# --- Task definitions ------------------------------------------------------
locals {
  log_config = { for name, group in aws_cloudwatch_log_group.app : name => {
    logDriver = "awslogs"
    options = {
      "awslogs-group"         = group.name
      "awslogs-region"        = local.aws_region
      "awslogs-stream-prefix" = name
    }
  } }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution["api"].arn
  task_role_arn            = aws_iam_role.task["api"].arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name             = "api"
    image            = "${local.backend_repo}:${var.bootstrap_image_tag}"
    essential        = true
    portMappings     = [{ containerPort = local.api_port, protocol = "tcp", name = "api" }]
    environment      = local.common_environment
    secrets          = local.common_secrets
    logConfiguration = local.log_config["api"]
    linuxParameters  = { initProcessEnabled = true }
    healthCheck = {
      command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
      interval    = 15
      timeout     = 5
      retries     = 5
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution["worker"].arn
  task_role_arn            = aws_iam_role.task["worker"].arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  volume {
    name = "llm-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.llm.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.llm.id
        iam             = "ENABLED"
      }
    }
  }
  container_definitions = jsonencode([
    {
      name              = "freellmapi"
      image             = "${data.aws_ecr_repository.freellmapi.repository_url}@sha256:${var.freellmapi_digest}"
      essential         = true
      memoryReservation = 512
      portMappings      = [{ containerPort = 3001, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3001" },
        { name = "REQUEST_BODY_LIMIT_MB", value = "40" },
        { name = "FREELLMAPI_UPDATE_CHECK", value = "off" },
      ]
      secrets = [
        { name = "ENCRYPTION_KEY", valueFrom = local.secret_arn["llm_encryption_key"] },
        { name = "FREEAPI_CONFIG_JSON", valueFrom = local.secret_arn["llm_config_json"] },
      ]
      mountPoints      = [{ sourceVolume = "llm-data", containerPath = "/app/server/data", readOnly = false }]
      logConfiguration = local.log_config["freellmapi"]
      linuxParameters  = { initProcessEnabled = true }
      healthCheck = {
        command     = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/ping').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
        interval    = 15
        timeout     = 5
        retries     = 10
        startPeriod = 20
      }
    },
    {
      name              = "worker"
      image             = "${local.backend_repo}:${var.bootstrap_image_tag}"
      essential         = true
      command           = ["python", "-m", "app.workers.ai_analysis"]
      memoryReservation = 256
      dependsOn         = [{ containerName = "freellmapi", condition = "HEALTHY" }]
      environment = concat(local.common_environment, [
        { name = "AI_WORKER_PROVIDER", value = "freellmapi" },
        # Mesma task (awsvpc): o sidecar responde no loopback.
        { name = "FREELLMAPI_BASE_URL", value = "http://127.0.0.1:3001/v1" },
        { name = "FREELLMAPI_MODEL", value = "auto" },
      ])
      secrets = concat(local.common_secrets, [
        { name = "FREELLMAPI_API_KEY", valueFrom = local.secret_arn["llm_api_key"] },
      ])
      logConfiguration = local.log_config["worker"]
      stopTimeout      = 120
      # Sem initProcessEnabled: o health check confere que o PID 1 é o worker.
      healthCheck = {
        command     = ["CMD", "python", "/app/infra/aws/staging/worker-health.py"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 30
      }
    },
  ])
}

# --- Descoberta de serviço (Cloud Map) -------------------------------------
resource "aws_service_discovery_private_dns_namespace" "this" {
  name = "${local.name}.local"
  vpc  = module.network.vpc_id
}

# SRV: o API Gateway precisa da porta da task, que o ECS registra com o IP.
resource "aws_service_discovery_service" "api" {
  name = "api"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "SRV"
      ttl  = 10
    }
  }
}

# --- Serviços ---------------------------------------------------------------
resource "aws_ecs_service" "api" {
  name                   = "api"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.api.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = true
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = values(module.network.egress_subnet_ids)
    security_groups  = [module.network.api_security_group_id]
    assign_public_ip = true # saída para AWS sem NAT; o SG não tem ingress público
  }
  service_registries {
    registry_arn   = aws_service_discovery_service.api.arn
    container_name = "api"
    container_port = local.api_port
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  # O deploy-prod.yml registra novas revisões com o SHA promovido.
  lifecycle { ignore_changes = [task_definition] }
}

resource "aws_ecs_service" "worker" {
  name                   = "worker"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = 0
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = true
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = values(module.network.egress_subnet_ids)
    security_groups  = [module.network.worker_security_group_id]
    assign_public_ip = true
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  depends_on = [aws_efs_mount_target.llm]
  # Revisões pelo deploy; quantidade pelo autoscaling da fila.
  lifecycle { ignore_changes = [task_definition, desired_count] }
}

# --- Worker de 0 a 1 pela fila ---------------------------------------------
resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 0
  max_capacity       = 1
}

resource "aws_appautoscaling_policy" "worker" {
  for_each           = { up = 1, down = 0 }
  name               = "${local.name}-worker-${each.key}"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  policy_type        = "StepScaling"
  step_scaling_policy_configuration {
    adjustment_type         = "ExactCapacity"
    cooldown                = 60
    metric_aggregation_type = "Maximum"
    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = each.value
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_up" {
  alarm_name          = "${local.name}-worker-fila-com-mensagem"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = module.messaging.processing_queue_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_appautoscaling_policy.worker["up"].arn]
}

# Desliga quando não há nada visível nem em processamento por 15 minutos.
resource "aws_cloudwatch_metric_alarm" "worker_down" {
  alarm_name          = "${local.name}-worker-fila-vazia"
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_appautoscaling_policy.worker["down"].arn]
  metric_query {
    id          = "total"
    expression  = "visible + inflight"
    label       = "Mensagens na fila"
    return_data = true
  }
  dynamic "metric_query" {
    for_each = { visible = "ApproximateNumberOfMessagesVisible", inflight = "ApproximateNumberOfMessagesNotVisible" }
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/SQS"
        metric_name = metric_query.value
        dimensions  = { QueueName = module.messaging.processing_queue_name }
        period      = 300
        stat        = "Maximum"
      }
    }
  }
}
