#!/usr/bin/env node

/**
 * Deploy Scheduler and Worker Lambdas to LocalStack using AWS SDK
 * Alternative to awslocal CLI (which may not be installed)
 */

const {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  AddPermissionCommand,
  CreateEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
  DeleteEventSourceMappingCommand,
} = require('@aws-sdk/client-lambda');
const {
  EventBridgeClient,
  PutTargetsCommand,
  PutRuleCommand,
  DescribeRuleCommand,
} = require('@aws-sdk/client-eventbridge');
const { IAMClient, GetRoleCommand } = require('@aws-sdk/client-iam');
const { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const fs = require('fs');
const path = require('path');

const lambdaClient = new LambdaClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

const eventBridgeClient = new EventBridgeClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

const iamClient = new IAMClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

const sqsClient = new SQSClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

async function ensureIAMRole() {
  console.log('Ensuring IAM role exists...');
  try {
    await iamClient.send(new GetRoleCommand({ RoleName: 'lambda-execution-role' }));
    console.log('✓ IAM role already exists');
  } catch (error) {
    console.log('✓ Skipping IAM role creation (not required in LocalStack)');
  }
}

async function deploySchedulerLambda(queueUrl) {
  const zipPath = path.join(__dirname, '../dist/event-scheduler.zip');

  if (!fs.existsSync(zipPath)) {
    console.error('❌ Scheduler Lambda package not found. Run "npm run lambda:build" first.');
    process.exit(1);
  }

  console.log('\n==========================================');
  console.log('Deploying Scheduler Lambda');
  console.log('==========================================\n');

  // Delete existing Lambda (if exists)
  console.log('Removing existing scheduler Lambda (if exists)...');
  try {
    await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: 'event-scheduler' }));
    console.log('✓ Existing scheduler Lambda deleted');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.log('✓ No existing scheduler Lambda to delete');
  }

  // Read zip file
  const zipBuffer = fs.readFileSync(zipPath);

  // Create Lambda function
  console.log('Creating scheduler Lambda function...');
  const createResponse = await lambdaClient.send(
    new CreateFunctionCommand({
      FunctionName: 'event-scheduler',
      Runtime: 'nodejs20.x',
      Handler: 'schedulerHandler.handler',
      Code: { ZipFile: zipBuffer },
      Role: 'arn:aws:iam::000000000000:role/lambda-execution-role',
      Timeout: 60,
      MemorySize: 512,
      Environment: {
        Variables: {
          DATABASE_URL: 'postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db',
          SQS_QUEUE_URL: queueUrl,
          AWS_ENDPOINT_URL: 'http://localstack:4566',
          AWS_REGION: 'us-east-1',
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
        },
      },
    })
  );

  console.log('✓ Scheduler Lambda created');
  console.log(`  ARN: ${createResponse.FunctionArn}`);

  // Configure EventBridge
  console.log('\nConfiguring EventBridge → Scheduler Lambda...');

  try {
    await eventBridgeClient.send(new DescribeRuleCommand({ Name: 'event-scheduler-rule' }));
    console.log('✓ EventBridge rule already exists');
  } catch (error) {
    console.log('Creating EventBridge rule...');
    await eventBridgeClient.send(
      new PutRuleCommand({
        Name: 'event-scheduler-rule',
        ScheduleExpression: 'rate(1 minute)',
        State: 'ENABLED',
        Description: 'Triggers event scheduler Lambda every 1 minute',
      })
    );
    console.log('✓ EventBridge rule created');
  }

  await eventBridgeClient.send(
    new PutTargetsCommand({
      Rule: 'event-scheduler-rule',
      Targets: [{ Id: '1', Arn: createResponse.FunctionArn }],
    })
  );
  console.log('✓ EventBridge target configured');

  try {
    await lambdaClient.send(
      new AddPermissionCommand({
        FunctionName: 'event-scheduler',
        StatementId: 'EventBridgeInvokePermission',
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: 'arn:aws:events:us-east-1:000000000000:rule/event-scheduler-rule',
      })
    );
    console.log('✓ EventBridge permission granted');
  } catch (error) {
    console.log('✓ Permission already exists');
  }

  console.log('\n✅ Scheduler Lambda deployment complete!');
  return createResponse.FunctionArn;
}

async function deployWorkerLambda(queueUrl, queueArn) {
  const zipPath = path.join(__dirname, '../dist/event-worker.zip');

  if (!fs.existsSync(zipPath)) {
    console.error('❌ Worker Lambda package not found. Run "npm run lambda:build" first.');
    process.exit(1);
  }

  console.log('\n==========================================');
  console.log('Deploying Worker Lambda');
  console.log('==========================================\n');

  // Delete existing Lambda (if exists)
  console.log('Removing existing worker Lambda (if exists)...');
  try {
    await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: 'event-worker' }));
    console.log('✓ Existing worker Lambda deleted');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.log('✓ No existing worker Lambda to delete');
  }

  // Read zip file
  const zipBuffer = fs.readFileSync(zipPath);

  // Create Lambda function
  console.log('Creating worker Lambda function...');
  const createResponse = await lambdaClient.send(
    new CreateFunctionCommand({
      FunctionName: 'event-worker',
      Runtime: 'nodejs20.x',
      Handler: 'workerHandler.handler',
      Code: { ZipFile: zipBuffer },
      Role: 'arn:aws:iam::000000000000:role/lambda-execution-role',
      Timeout: 60,
      MemorySize: 512,
      Environment: {
        Variables: {
          DATABASE_URL: 'postgresql://bday_user:local_dev_password@host.docker.internal:5432/bday_db',
          WEBHOOK_TEST_URL: process.env.WEBHOOK_TEST_URL || 'https://webhook.site/test',
          AWS_ENDPOINT_URL: 'http://localstack:4566',
          AWS_REGION: 'us-east-1',
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
        },
      },
    })
  );

  console.log('✓ Worker Lambda created');
  console.log(`  ARN: ${createResponse.FunctionArn}`);

  // Configure SQS Event Source Mapping
  console.log('\nConfiguring SQS → Worker Lambda...');

  // Delete existing event source mappings
  const listMappingsResponse = await lambdaClient.send(
    new ListEventSourceMappingsCommand({ FunctionName: 'event-worker' })
  );

  for (const mapping of listMappingsResponse.EventSourceMappings || []) {
    console.log(`Deleting existing event source mapping: ${mapping.UUID}`);
    await lambdaClient.send(
      new DeleteEventSourceMappingCommand({ UUID: mapping.UUID })
    );
  }

  // Create new event source mapping
  const eventSourceMapping = await lambdaClient.send(
    new CreateEventSourceMappingCommand({
      EventSourceArn: queueArn,
      FunctionName: 'event-worker',
      BatchSize: 10,
      MaximumBatchingWindowInSeconds: 0,
      Enabled: true,
    })
  );

  console.log('✓ SQS event source mapping created');
  console.log(`  UUID: ${eventSourceMapping.UUID}`);

  console.log('\n✅ Worker Lambda deployment complete!');
  return createResponse.FunctionArn;
}

async function deployLambdas() {
  console.log('\n==========================================');
  console.log('Lambda Deployment to LocalStack');
  console.log('==========================================\n');

  // Get SQS queue URL and ARN
  console.log('Getting SQS queue details...');
  let queueUrl, queueArn;
  try {
    const getQueueResponse = await sqsClient.send(
      new GetQueueUrlCommand({ QueueName: 'bday-events-queue' })
    );
    queueUrl = getQueueResponse.QueueUrl;

    const getAttributesResponse = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn'],
      })
    );
    queueArn = getAttributesResponse.Attributes.QueueArn;

    console.log(`✓ Queue URL: ${queueUrl}`);
    console.log(`✓ Queue ARN: ${queueArn}`);
  } catch (error) {
    console.error('❌ Queue not found. Ensure LocalStack is running (docker-compose up).');
    process.exit(1);
  }

  // Ensure IAM role exists
  await ensureIAMRole();

  // Deploy both Lambdas
  await deploySchedulerLambda(queueUrl);
  await deployWorkerLambda(queueUrl, queueArn);

  console.log('\n==========================================');
  console.log('🎉 All Lambdas deployed successfully!');
  console.log('==========================================');
  console.log('\nDeployed Functions:');
  console.log('  1. event-scheduler (EventBridge trigger every 1 minute)');
  console.log('  2. event-worker (SQS trigger, batch size 10)');
  console.log('\nRun E2E tests:');
  console.log('  npm test -- schedulerHandler.e2e.test.ts');
  console.log('  npm test -- event-scheduling-flow.e2e.test.ts (Story 2.10)');
  console.log('==========================================\n');
}

deployLambdas().catch((error) => {
  console.error('\n❌ Deployment failed:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
