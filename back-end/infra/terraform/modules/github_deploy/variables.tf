variable "account_id" { type = string }

# Repositório que publica (owner/nome). Só o Environment `staging` dele assume a role.
variable "repository" {
  type    = string
  default = "Vintex-Ages/vintex-prod"
}

# A conta tem um provedor OIDC do GitHub só: quem criar primeiro o declara, os
# outros states o leem por data source.
variable "create_oidc_provider" {
  type    = bool
  default = true
}

variable "backend_repository_arn" { type = string }
variable "instance_arn" { type = string }

variable "release_retention_days" {
  type    = number
  default = 30
}
