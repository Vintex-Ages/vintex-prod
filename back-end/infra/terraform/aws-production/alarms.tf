# Alarmes mínimos da produção (antiga back-end#178). Avisam por e-mail os
# mesmos destinatários do account.tfvars.json (budget_email_addresses).
resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarmes"
}

resource "aws_sns_topic_subscription" "alarms" {
  for_each  = var.budget_email_addresses
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alarms = {
    api-5xx = {
      namespace  = "AWS/ApiGateway", metric = "5xx", stat = "Sum", threshold = 5, op = "GreaterThanOrEqualToThreshold"
      dimensions = { ApiId = aws_apigatewayv2_api.this.id }, description = "API devolvendo 5xx"
    }
    dlq-com-mensagem = {
      namespace  = "AWS/SQS", metric = "ApproximateNumberOfMessagesVisible", stat = "Maximum", threshold = 1, op = "GreaterThanOrEqualToThreshold"
      dimensions = { QueueName = module.messaging.dead_letter_queue_name }, description = "Análise de IA caiu na DLQ"
    }
    rds-pouco-espaco = {
      namespace  = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", threshold = 2147483648, op = "LessThanThreshold"
      dimensions = { DBInstanceIdentifier = aws_db_instance.this.identifier }, description = "Menos de 2 GiB livres no RDS"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "ops" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = each.value.stat
  period              = 300
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = each.value.op
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}
