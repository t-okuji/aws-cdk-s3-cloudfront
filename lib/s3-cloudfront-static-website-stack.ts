import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class S3CloudfrontStaticWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3-readme.html)
    const bucket = new s3.Bucket(this, "S3CloudfrontStaticWebsiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudFront Function (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#cloudfront-function)
    const cloudfrontFunction = new cloudfront.Function(
      this,
      "S3CloudfrontStaticWebsiteFunction",
      {
        code: cloudfront.FunctionCode.fromFile({
          filePath: "./functions/cloudfront-basic-auth.js",
        }),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      }
    );

    // Cloudfront Distribution (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.Distribution.html)
    const distribution = new cloudfront.Distribution(
      this,
      "S3CloudfrontStaticWebsiteDistribution",
      {
        defaultBehavior: {
          origin: new origins.S3Origin(bucket),
          functionAssociations: [
            {
              function: cloudfrontFunction,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        defaultRootObject: "index.html",
      }
    );

    // Origin access control (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.CfnOriginAccessControl.html)
    const cfnOriginAccessControl = new cloudfront.CfnOriginAccessControl(
      this,
      "S3CloudfrontStaticWebsiteOriginAccessControl",
      {
        originAccessControlConfig: {
          name: "OriginAccessControlForS3",
          originAccessControlOriginType: "s3",
          signingProtocol: "sigv4",
          signingBehavior: "always",
        },
      }
    );

    // Delete OAI and Create OAC for Cloudfront (https://docs.aws.amazon.com/ja_jp/AWSCloudFormation/latest/UserGuide/quickref-cloudfront.html)
    const cfnDistribution = distribution.node
      .defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity",
      ""
    );
    cfnDistribution.addPropertyOverride(
      "DistributionConfig.Origins.0.OriginAccessControlId",
      cfnOriginAccessControl.attrId
    );

    // Bucket policy for OAC (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.PolicyStatement.html)
    const oacPolicy = new iam.PolicyStatement({
      sid: "AllowGetObjectForCloudFront",
      principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
      effect: iam.Effect.ALLOW,
      actions: ["s3:GetObject"],
      resources: [bucket.bucketArn + "/*"],
      conditions: {
        StringEquals: {
          "AWS:SourceArn": `arn:aws:cloudfront::${
            cdk.Stack.of(this).account
          }:distribution/${distribution.distributionId}`,
        },
      },
    });

    // S3 Bucket policy (https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.BucketPolicy.html)
    const bucketPolicy = new s3.BucketPolicy(
      this,
      "S3CloudfrontStaticWebsiteBucketPolicy",
      {
        bucket: bucket,
      }
    );

    // Add OAC policy to S3 Bucket policy
    bucketPolicy.document.addStatements(oacPolicy);
  }
}
