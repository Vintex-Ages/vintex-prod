# Deploy pelo GitHub Actions (OIDC): só o Environment `production` assume a role.
# O provedor OIDC pertence ao state da staging; aqui ele só é lido.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  staging_deploy_bucket = "vintex-deploy-staging-${var.expected_account_id}"
  task_families         = [aws_ecs_task_definition.api.family, aws_ecs_task_definition.worker.family]
}

resource "aws_iam_role" "deploy" {
  name                 = "VintexGithubDeployProduction"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.repository}:environment:production"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "vintex-deploy-production"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # RegisterTaskDefinition e Describe* não aceitam recurso específico.
        Sid      = "TaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "UpdateServices"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = [aws_ecs_service.api.id, aws_ecs_service.worker.id]
      },
      {
        Sid       = "RunMigration"
        Effect    = "Allow"
        Action    = ["ecs:RunTask"]
        Resource  = "arn:aws:ecs:${local.aws_region}:${var.expected_account_id}:task-definition/${aws_ecs_task_definition.api.family}:*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.this.arn } }
      },
      {
        Sid       = "WatchTasks"
        Effect    = "Allow"
        Action    = ["ecs:DescribeTasks", "ecs:ListTasks"]
        Resource  = "*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.this.arn } }
      },
      {
        Sid       = "PassTaskRoles"
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = concat([for role in aws_iam_role.execution : role.arn], [for role in aws_iam_role.task : role.arn])
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Sid      = "PromotedImageExists"
        Effect   = "Allow"
        Action   = ["ecr:DescribeImages"]
        Resource = data.aws_ecr_repository.backend.arn
      },
      {
        # O front promovido é o mesmo artefato que a staging publicou.
        Sid      = "ReadStagingRelease"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${local.staging_deploy_bucket}/releases/*"
      },
      {
        Sid      = "ListWeb"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.web.arn
      },
      {
        Sid      = "PublishWeb"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.web.arn}/*"
      },
      {
        Sid      = "InvalidateCache"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = aws_cloudfront_distribution.this.arn
      },
      {
        Sid      = "MigrationLogs"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents", "logs:FilterLogEvents"]
        Resource = "${aws_cloudwatch_log_group.app["migrate"].arn}:*"
      },
    ]
  })
}
