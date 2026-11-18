locals {
  oidc_url    = "token.actions.githubusercontent.com"
  bucket_name = "vintex-deploy-staging-${var.account_id}"
  # Nome fixo: o ARN fica conhecido já no plan, sem esperar a criação do bucket.
  bucket_arn = "arn:aws:s3:::vintex-deploy-staging-${var.account_id}"
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://${local.oidc_url}"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# Artefatos de release (front e back-end) por SHA. Privado, só TLS, expira sozinho.
resource "aws_s3_bucket" "releases" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket                  = aws_s3_bucket.releases.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    id     = "expira-releases"
    status = "Enabled"
    filter { prefix = "releases/" }
    expiration { days = var.release_retention_days }
  }
}

resource "aws_s3_bucket_policy" "releases_tls" {
  bucket = aws_s3_bucket.releases.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [local.bucket_arn, "${local.bucket_arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_iam_role" "deploy" {
  name                 = "VintexGithubDeployStaging"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_url}:aud" = "sts.amazonaws.com"
          "${local.oidc_url}:sub" = "repo:${var.repository}:environment:staging"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "vintex-deploy-staging"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuthentication"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PushBackendImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage",
          "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages"
        ]
        Resource = var.backend_repository_arn
      },
      {
        Sid      = "ReleaseArtifacts"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${local.bucket_arn}/releases/*"
      },
      {
        Sid    = "RunDeployOnStagingHost"
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          var.instance_arn,
          "arn:aws:ssm:us-east-2::document/AWS-RunShellScript"
        ]
      },
      {
        Sid      = "ReadDeployResult"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:DescribeInstanceInformation"]
        Resource = "*"
      },
      {
        Sid      = "DescribeStagingHost"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
        Resource = "*"
      },
      {
        # Fora do horário o deploy liga a EC2 e a desliga depois.
        Sid       = "StartStopStagingHost"
        Effect    = "Allow"
        Action    = ["ec2:StartInstances", "ec2:StopInstances"]
        Resource  = var.instance_arn
        Condition = { StringEquals = { "ec2:ResourceTag/Environment" = "staging", "ec2:ResourceTag/Project" = "Vintex" } }
      }
    ]
  })
}
