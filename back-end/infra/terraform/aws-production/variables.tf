variable "deployment" {
  type = string
  validation {
    condition     = var.deployment == "production"
    error_message = "Selecione production pelo arquivo de variáveis."
  }
}

variable "expected_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "Informe a conta AWS esperada com 12 dígitos."
  }
}

variable "state_bucket" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket))
    error_message = "Informe um nome válido para o bucket do state."
  }
}

# Campos do account.tfvars.json compartilhado com a staging; a produção não os usa.
variable "enable_budget" {
  type    = bool
  default = false
}

variable "budget_email_addresses" {
  type    = set(string)
  default = []
}

variable "public_preview" {
  type    = bool
  default = false
}

# Imagem da primeira task definition. Depois o deploy-prod.yml registra novas
# revisões com o SHA promovido; o Terraform não volta a imagem (ignore_changes).
variable "bootstrap_image_tag" {
  type    = string
  default = "5aab733e5438090a6615efff617fc588a2524f89"
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.bootstrap_image_tag))
    error_message = "Use o SHA completo de uma imagem já publicada no ECR."
  }
}

# Mesmo digest fixado na staging (scripts/infra/deploy_staging.py).
variable "freellmapi_digest" {
  type    = string
  default = "1942b1437628deb70699d7371dab3cb7e65c296c4e1db345218b4de2102149eb"
}

variable "repository" {
  type    = string
  default = "Vintex-Ages/vintex-prod"
}
