output "public_url" {
  description = "URL pública da produção (PUBLIC_BASE_URL do Environment production)."
  value       = local.public_url
}

output "deploy_role_arn" {
  description = "AWS_ROLE_ARN do Environment production no GitHub."
  value       = aws_iam_role.deploy.arn
}

# Tudo o que o deploy-prod.yml precisa, sem segredos.
output "deploy_config" {
  value = {
    cluster              = aws_ecs_cluster.this.name
    api_service          = aws_ecs_service.api.name
    worker_service       = aws_ecs_service.worker.name
    api_family           = aws_ecs_task_definition.api.family
    worker_family        = aws_ecs_task_definition.worker.family
    subnets              = values(module.network.egress_subnet_ids)
    api_security_group   = module.network.api_security_group_id
    web_bucket           = aws_s3_bucket.web.id
    distribution_id      = aws_cloudfront_distribution.this.id
    staging_bucket       = local.staging_deploy_bucket
    migrate_log_group    = aws_cloudwatch_log_group.app["migrate"].name
    backend_repository   = data.aws_ecr_repository.backend.repository_url
    freellmapi_image     = "${data.aws_ecr_repository.freellmapi.repository_url}@sha256:${var.freellmapi_digest}"
    llm_api_key_secret   = aws_secretsmanager_secret.llm_api_key.name
    database_endpoint    = aws_db_instance.this.address
    processing_queue_url = module.messaging.processing_queue_url
  }
}
