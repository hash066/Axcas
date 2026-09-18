# Axcas Studio on Amplify

This directory turns the existing structured Studio renderer into a static Amplify artifact. It injects only public runtime values: the API origin, AWS region, Cognito pool/client identifiers, and Axcas WhatsApp number. Provider tokens and service secrets never enter the build or browser.

After the `axcas-beta-native` CloudFormation stack exists, deploy the Studio branch with:

```powershell
./apps/aws-studio/deploy.ps1 -StackName axcas-beta-native -Region ap-south-1
```

The deployment script reads CloudFormation outputs, builds five static files, creates an Amplify manual-deployment job, uploads the ZIP to its one-time URL, and starts that exact job. `dist/` is ignored and is not source evidence.

The CloudFormation stack derives one exact Studio origin from its configured Amplify branch. API Gateway allows only that origin with `Authorization` and `Content-Type`; its managed preflight route is unauthenticated, while every account, project, approval, OAuth, and upload API route requires the Cognito JWT.

The browser uses Cognito `CUSTOM_AUTH`: the merchant enters a verified WhatsApp number, receives a six-digit WhatsApp template message, and enters it in Studio. Tokens stay in `sessionStorage` and are attached only to the configured API origin.

## Current boundary

This is a deployable frontend and authentication adapter, not a claim that AWS Studio is complete. The AWS API currently exposes authenticated Meta OAuth and multipart media endpoints; account/project revision, build, approval, export/deletion, and session-management parity with the existing Worker must land before cutover. The Cognito user must also be provisioned by the WhatsApp onboarding boundary before `InitiateAuth` can succeed.
