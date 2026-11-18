mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/test" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-2:123456789012:cluster/test" }
  }
  mock_resource "aws_efs_file_system" {
    defaults = { arn = "arn:aws:elasticfilesystem:us-east-2:123456789012:file-system/fs-test" }
  }
  mock_resource "aws_efs_access_point" {
    defaults = { arn = "arn:aws:elasticfilesystem:us-east-2:123456789012:access-point/fsap-test" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-2:123456789012:test" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:us-east-2:123456789012:service/srv-test" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-2:123456789012:secret:test" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::test" }
  }
  mock_resource "aws_appautoscaling_policy" {
    defaults = { arn = "arn:aws:autoscaling:us-east-2:123456789012:scalingPolicy:test" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-2:123456789012:log-group:test" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/test" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:us-east-2:123456789012:task-definition/test:1" }
  }
}
mock_provider "random" {}

variables {
  expected_account_id = "123456789012"
  deployment          = "production"
  state_bucket        = "vintex-test-state"
}

override_data {
  target          = data.aws_ecr_repository.backend
  override_during = apply
  values = {
    arn            = "arn:aws:ecr:us-east-2:123456789012:repository/vintex-backend"
    repository_url = "123456789012.dkr.ecr.us-east-2.amazonaws.com/vintex-backend"
  }
}
override_data {
  target          = data.aws_ecr_repository.freellmapi
  override_during = apply
  values          = { repository_url = "123456789012.dkr.ecr.us-east-2.amazonaws.com/freellmapi" }
}
override_data {
  target          = data.aws_iam_openid_connect_provider.github
  override_during = apply
  values          = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
}
override_data {
  target          = data.aws_iam_policy_document.ecs_tasks_trust
  override_during = apply
  values          = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
}
override_resource {
  target          = aws_cloudfront_distribution.this
  override_during = apply
  values = {
    id          = "E000000000TEST"
    arn         = "arn:aws:cloudfront::123456789012:distribution/E000000000TEST"
    domain_name = "d000000test.cloudfront.net"
  }
}

run "banco_privado_criptografado_e_com_backup" {
  command = apply
  assert {
    condition     = !aws_db_instance.this.publicly_accessible && aws_db_instance.this.storage_encrypted && aws_db_instance.this.deletion_protection && !aws_db_instance.this.skip_final_snapshot
    error_message = "RDS privado, criptografado, protegido contra exclusão e com snapshot final."
  }
  assert {
    condition     = aws_db_instance.this.backup_retention_period == 7 && aws_db_instance.this.engine == "postgres" && startswith(aws_db_instance.this.engine_version, "16") && aws_db_instance.this.instance_class == "db.t4g.micro"
    error_message = "PostgreSQL 16 db.t4g.micro com backup automático de 7 dias."
  }
  assert {
    condition     = one([for p in aws_db_parameter_group.this.parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "Conexão com o banco só por TLS."
  }
  assert {
    condition     = length(aws_subnet.data) == 2 && alltrue([for subnet in aws_subnet.data : subnet.map_public_ip_on_launch != true])
    error_message = "Banco em duas AZs, em subnets sem IP público."
  }
  assert {
    condition     = toset([for rule in aws_vpc_security_group_ingress_rule.database_from_app : rule.from_port]) == toset([5432]) && length(aws_vpc_security_group_ingress_rule.database_from_app) == 2
    error_message = "Postgres só a partir da API e do worker."
  }
}

run "api_continua_e_ia_so_assincrona" {
  command = apply
  assert {
    condition     = aws_ecs_service.api.desired_count == 1 && aws_ecs_service.api.launch_type == "FARGATE" && one(aws_ecs_task_definition.api.runtime_platform).cpu_architecture == "ARM64"
    error_message = "API contínua em Fargate ARM64."
  }
  assert {
    condition     = one([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.value if e.name == "AI_PROVIDER"]) == "unavailable"
    error_message = "API sem IA síncrona na produção (ADR 0003)."
  }
  assert {
    condition     = one([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.value if e.name == "APP_ENV"]) == "production" && one([for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.value if e.name == "PUBLIC_BASE_URL"]) == "https://d000000test.cloudfront.net"
    error_message = "API em modo produção com a URL do CloudFront."
  }
  assert {
    condition     = toset([for s in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets : s.name]) == toset(["DATABASE_URL", "JWT_SECRET"]) && !strcontains(aws_ecs_task_definition.api.container_definitions, "postgresql://")
    error_message = "Segredos da API só pelo Secrets Manager, nunca no ambiente."
  }
  assert {
    condition     = one(aws_ecs_service.api.service_registries).container_port == 8000 && one(aws_service_discovery_service.api.dns_config).dns_records[0].type == "SRV"
    error_message = "API registrada no Cloud Map com porta (SRV) para o VPC Link."
  }
}

run "worker_de_zero_a_um_com_freellmapi_sidecar" {
  command = apply
  assert {
    condition     = aws_ecs_service.worker.desired_count == 0 && aws_appautoscaling_target.worker.min_capacity == 0 && aws_appautoscaling_target.worker.max_capacity == 1
    error_message = "Worker escala de 0 a 1."
  }
  assert {
    condition     = [for c in jsondecode(aws_ecs_task_definition.worker.container_definitions) : c.name] == ["freellmapi", "worker"] && jsondecode(aws_ecs_task_definition.worker.container_definitions)[1].dependsOn[0].condition == "HEALTHY"
    error_message = "Worker só sobe com o FreeLLMAPI saudável na mesma task."
  }
  assert {
    condition     = one([for e in jsondecode(aws_ecs_task_definition.worker.container_definitions)[1].environment : e.value if e.name == "FREELLMAPI_BASE_URL"]) == "http://127.0.0.1:3001/v1"
    error_message = "Worker fala com o sidecar pelo loopback."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].mountPoints[0].containerPath == "/app/server/data" && one(one(aws_ecs_task_definition.worker.volume).efs_volume_configuration).transit_encryption == "ENABLED"
    error_message = "SQLite do FreeLLMAPI no EFS com TLS em trânsito."
  }
  assert {
    condition     = aws_efs_file_system.llm.encrypted && aws_efs_access_point.llm.root_directory[0].path == "/freellmapi"
    error_message = "EFS criptografado e acessado por access point."
  }
  assert {
    condition     = !can(jsondecode(aws_ecs_task_definition.worker.container_definitions)[1].linuxParameters.initProcessEnabled)
    error_message = "Health check do worker exige o worker como PID 1."
  }
}

run "execution_roles_so_com_os_segredos_de_cada_task" {
  command = apply
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.execution_secrets["api"].policy).Statement[0].Resource) == 2 && length(jsondecode(aws_iam_role_policy.execution_secrets["worker"].policy).Statement[0].Resource) == 5
    error_message = "A API não lê os segredos do FreeLLMAPI."
  }
  assert {
    condition     = !strcontains(aws_iam_role_policy.api.policy, "sqs:ReceiveMessage") && !strcontains(aws_iam_role_policy.worker.policy, "sqs:SendMessage") && !strcontains(aws_iam_role_policy.worker.policy, "s3:PutObject")
    error_message = "API só publica na fila; worker só consome e só lê mídia."
  }
}

run "borda_cloudfront_api_gateway_sem_acesso_direto" {
  command = apply
  assert {
    condition     = aws_apigatewayv2_integration.api.connection_type == "VPC_LINK" && aws_apigatewayv2_integration.api.integration_type == "HTTP_PROXY"
    error_message = "API Gateway chega à API só pelo VPC Link."
  }
  assert {
    condition     = toset(keys(aws_apigatewayv2_route.api)) == toset(["ANY /api", "ANY /api/{proxy+}", "GET /health"])
    error_message = "Só /api e /health passam pelo API Gateway."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.web.restrict_public_buckets && aws_cloudfront_origin_access_control.web.signing_behavior == "always"
    error_message = "Front privado, lido só pelo CloudFront (OAC)."
  }
  assert {
    condition     = toset([for b in aws_cloudfront_distribution.this.ordered_cache_behavior : b.path_pattern]) == toset(["/api/*", "/health"]) && aws_cloudfront_distribution.this.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "CloudFront só HTTPS, com /api e /health para a API."
  }
  assert {
    condition     = !strcontains(aws_cloudfront_function.spa.code, "register")
    error_message = "Cadastro público aberto na produção (sem bloqueio na borda)."
  }
}

run "deploy_so_do_environment_production" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:Vintex-Ages/vintex-prod:environment:production"
    error_message = "Só o Environment production assume a role."
  }
  assert {
    condition     = !strcontains(aws_iam_role_policy.deploy.policy, "ecr:PutImage") && !strcontains(aws_iam_role_policy.deploy.policy, "secretsmanager") && !strcontains(aws_iam_role_policy.deploy.policy, "rds:")
    error_message = "Produção não constrói imagem nem lê segredos ou o banco."
  }
}


override_resource {
  target          = aws_cloudwatch_log_group.app
  override_during = apply
  values          = { arn = "arn:aws:logs:us-east-2:123456789012:log-group:/vintex/production/test" }
}
override_resource {
  target          = aws_cloudfront_function.spa
  override_during = apply
  values          = { arn = "arn:aws:cloudfront::123456789012:function/vintex-production-spa" }
}
