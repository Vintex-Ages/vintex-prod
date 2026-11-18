mock_provider "aws" {}
variables {
  account_id             = "123456789012"
  backend_repository_arn = "arn:aws:ecr:us-east-2:123456789012:repository/vintex-backend"
  instance_arn           = "arn:aws:ec2:us-east-2:123456789012:instance/i-00000000000000001"
}
override_resource {
  target          = aws_iam_openid_connect_provider.github
  override_during = plan
  values          = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
}

run "role_so_do_environment_staging_do_vintex_prod" {
  command = plan
  module { source = "../modules/github_deploy" }
  assert {
    condition     = aws_iam_openid_connect_provider.github[0].url == "https://token.actions.githubusercontent.com" && aws_iam_openid_connect_provider.github[0].client_id_list == toset(["sts.amazonaws.com"])
    error_message = "Provedor OIDC deve ser o do GitHub Actions com audiência STS."
  }
  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity" &&
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:Vintex-Ages/vintex-prod:environment:staging" &&
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    )
    error_message = "Só o Environment staging do vintex-prod assume a role."
  }
  assert {
    condition     = aws_iam_role.deploy.max_session_duration == 3600
    error_message = "Sessão do deploy limitada a uma hora."
  }
}

run "privilegio_minimo" {
  command = plan
  module { source = "../modules/github_deploy" }
  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[1].Resource == var.backend_repository_arn && !strcontains(aws_iam_role_policy.deploy.policy, "freellmapi")
    error_message = "Push só no repositório do back-end."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[2].Resource == "arn:aws:s3:::vintex-deploy-staging-123456789012/releases/*" && !strcontains(aws_iam_role_policy.deploy.policy, "vintex-media")
    error_message = "S3 só no prefixo de releases do bucket de deploy."
  }
  assert {
    condition     = toset(jsondecode(aws_iam_role_policy.deploy.policy).Statement[3].Resource) == toset([var.instance_arn, "arn:aws:ssm:us-east-2::document/AWS-RunShellScript"])
    error_message = "SendCommand só na instância da staging e no documento de shell."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.deploy.policy).Statement[6].Resource == var.instance_arn && jsondecode(aws_iam_role_policy.deploy.policy).Statement[6].Condition.StringEquals["ec2:ResourceTag/Environment"] == "staging"
    error_message = "Start/Stop só na instância com tag de staging."
  }
  assert {
    condition     = !strcontains(aws_iam_role_policy.deploy.policy, "iam:") && !strcontains(aws_iam_role_policy.deploy.policy, "ssm:GetParameter") && !strcontains(aws_iam_role_policy.deploy.policy, "\"s3:*\"")
    error_message = "Deploy não administra IAM nem lê segredos."
  }
}

run "bucket_privado_com_expiracao" {
  command = plan
  module { source = "../modules/github_deploy" }
  assert {
    condition     = aws_s3_bucket.releases.bucket == "vintex-deploy-staging-123456789012" && aws_s3_bucket_public_access_block.releases.restrict_public_buckets && aws_s3_bucket_public_access_block.releases.block_public_policy
    error_message = "Bucket de releases privado."
  }
  assert {
    condition     = one(aws_s3_bucket_lifecycle_configuration.releases.rule).expiration[0].days == 30 && one(aws_s3_bucket_lifecycle_configuration.releases.rule).filter[0].prefix == "releases/"
    error_message = "Releases expiram em 30 dias."
  }
  assert {
    condition     = jsondecode(aws_s3_bucket_policy.releases_tls.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false" && one(aws_s3_bucket_server_side_encryption_configuration.releases.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "Só TLS e criptografia em repouso."
  }
}

run "conta_com_provedor_existente_so_le" {
  command = plan
  module { source = "../modules/github_deploy" }
  variables { create_oidc_provider = false }
  override_data {
    target = data.aws_iam_openid_connect_provider.github
    values = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && length(data.aws_iam_openid_connect_provider.github) == 1
    error_message = "Sem criação quando o provedor já existe."
  }
}
