output "role_arn" {
  description = "AWS_ROLE_ARN do Environment staging no GitHub."
  value       = aws_iam_role.deploy.arn
}

output "bucket" {
  description = "DEPLOY_BUCKET do Environment staging no GitHub."
  value       = aws_s3_bucket.releases.id
}

output "bucket_arn" {
  value = aws_s3_bucket.releases.arn
}

output "oidc_provider_arn" {
  value = local.oidc_provider_arn
}
