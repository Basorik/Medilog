# Medilog AI relay on AWS (Sydney)

The relay is a small Lambda function with an HTTPS URL. It calls Claude on Amazon Bedrock through the **Australian cross-region profile**, which routes between Sydney (`ap-southeast-2`) and Melbourne (`ap-southeast-4`). It authenticates to Bedrock with an IAM role, so there is no API key. It stores nothing, and it logs only outcome counts (`ok`, `declined:<category>`, upstream status codes), never note text.

```
phone ──HTTPS + x-medilog-token──▶ Lambda Function URL (Sydney) ──IAM role──▶ Bedrock au.* profile (Sydney/Melbourne)
```

Expected cost at beta scale is a few dollars a month or less: Lambda's free tier, plus about $0.0004 per note and about 3¢ per appointment report.

Console labels change from time to time. If a button below is named slightly differently, look for the closest match, or ask.

---

## Part A: one-time AWS setup (about 30–45 minutes)

### 1. AWS account and your admin login

1. If you don't have an account yet, create one at <https://aws.amazon.com>. Turn on MFA for the root user (**IAM → Security recommendations**). From then on, don't use root for day-to-day work.
2. In the console, switch the region (top right) to **Asia Pacific (Sydney) ap-southeast-2**.
3. Open **IAM Identity Center** → **Enable**. Then:
   - **Users → Add user**: yourself, with your email.
   - **Permission sets → Create**: predefined `AdministratorAccess`.
   - **AWS accounts →** select your account → **Assign users or groups**: you, with `AdministratorAccess`.
   - Accept the invitation email and set a password and MFA.
4. On your Mac, install the AWS CLI and log in:
   ```bash
   brew install awscli
   aws configure sso
   #   SSO start URL:  the "AWS access portal URL" on the Identity Center dashboard
   #   SSO region:     ap-southeast-2
   #   pick your account and AdministratorAccess
   #   default region: ap-southeast-2 · output: json · profile name: medilog
   aws sso login --profile medilog
   export AWS_PROFILE=medilog
   aws sts get-caller-identity        # should print your account number
   ```

### 2. Turn on Claude in Bedrock (Sydney)

1. Open the **Amazon Bedrock** console, still in Sydney.
2. Go to **Model catalog**, filter by provider **Anthropic**, and open **Claude Haiku 5.5**.
3. Choose **Open in playground** (or **Test**). Where it asks how to run the model, pick the **Australia (AU) cross-region inference profile**. Send a one-word message such as "Hello".
   - The first time, Bedrock may ask for **Anthropic's use-case details**. Fill them in, for example: *"Patient-facing app that structures a patient's own symptom notes into a summary for their doctor. No diagnosis or treatment advice."* Then accept the terms.
   - This first call is what enables the model for your account. The relay's IAM role is deliberately not allowed to do it.
4. Repeat for **Claude Sonnet 5.5**.
5. Go to **Cross-region inference** (or **Inference profiles**) and find the AU profiles for both models. Check their IDs. The code expects:
   - `au.anthropic.claude-haiku-5-5`
   - `au.anthropic.claude-sonnet-5-5`

   If yours differ, note them (see the troubleshooting section).

### 3. Keep Bedrock from storing prompts

Open **Bedrock → Settings → Model invocation logging** and confirm it is **off**. It is off by default; leave it off, because turning it on would store prompts and outputs.

### 4. Cost guardrails

1. **Billing and Cost Management → Budgets → Create budget →** template **Monthly cost budget**, amount **$20**, alerts to your email.
2. If you have **AWS Activate** credits, redeem them under **Billing → Credits**.

### 5. Check Bedrock works from your Mac (before deploying)

From the repo root:

```bash
npm install
AWS_PROFILE=medilog MEDILOG_PROVIDER=bedrock npm run smoke
```

You should see two ✓ lines (extraction and report), each with a time and a cost of a fraction of a cent. If not, the ✗ line tells you what to fix.

### 6. Deploy the relay

```bash
export AWS_PROFILE=medilog
export MEDILOG_ACCESS_TOKEN=$(openssl rand -hex 32)
echo "$MEDILOG_ACCESS_TOKEN"     # save this in your password manager
./deploy/aws/deploy.sh
```

The script builds the bundle, creates or updates the CloudFormation stack `medilog-relay` (IAM role, Lambda function, HTTPS URL, 30-day log retention), uploads the code, and runs the smoke test against the live URL. It ends by printing the **Relay URL**. Re-run the same command to deploy any later change.

### 7. Point the app at it

**Development build (what's on your phone now).** Create `mobile/.env.local`; it's git-ignored:

```bash
EXPO_PUBLIC_MEDILOG_RELAY_URL=https://xxxxxxxx.lambda-url.ap-southeast-2.on.aws
EXPO_PUBLIC_MEDILOG_RELAY_TOKEN=<the token from step 6>
```

Then run `npx expo start --dev-client --clear` in `mobile/` and reload the app. Go to **Settings**: a new switch, **Use cloud AI for richer notes**, appears. Its description says notes go to "Amazon Bedrock in Australia". Turn it on. New log entries show the ✨ Claude badge. If Claude declines or the network fails, entries quietly fall back to ⚙︎ On-device.

**Preview or production builds (for testers).** Store the values in EAS, then rebuild:

```bash
cd mobile
npx eas-cli@latest env:set preview --name EXPO_PUBLIC_MEDILOG_RELAY_URL --value https://xxxxxxxx.lambda-url.ap-southeast-2.on.aws --visibility plaintext
npx eas-cli@latest env:set preview --name EXPO_PUBLIC_MEDILOG_RELAY_TOKEN --value <token> --visibility sensitive
npx eas-cli@latest build --profile preview --platform android
```

The token ships inside the app, so treat it as a gate against casual misuse, not a secret. If it leaks, generate a new one, re-run `deploy.sh`, and rebuild the app.

---

## Part C: before real testers

1. **Measure quality and declines.** Each run costs cents:
   ```bash
   AWS_PROFILE=medilog MEDILOG_PROVIDER=bedrock npm run eval -- cloud               # 24 held-out notes vs the rules engine
   AWS_PROFILE=medilog MEDILOG_PROVIDER=bedrock npm run eval -- cloud --sensitive   # decline rate on sensitive-but-legitimate notes
   ```
2. **Dogfood for a week.** Watch **CloudWatch → Metrics → Custom namespaces → Medilog/Relay** for `Requests` by `Endpoint` and `Outcome`. Alongside that, compare how often you correct ✨ Claude tags versus ⚙︎ On-device tags.
3. **Get AWS to confirm in writing** that a Sydney-origin request on the AU profile is processed only in Australia. Then update your privacy policy and the consent wording.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Smoke test: "Access denied (403)" | Step 2 wasn't completed for that model (run one playground prompt with the AU profile), or your login lacks permissions. |
| Smoke test: "Bedrock rejected the request" | The profile ID differs. For local runs, set `MEDILOG_EXTRACT_MODEL` / `MEDILOG_REPORT_MODEL`. For the deployed relay, pass `ExtractModel`/`ReportModel` (without the `au.` prefix) via `--parameter-overrides` in `deploy.sh`. |
| Relay returns 401 | The app's token doesn't match the one the stack was deployed with. |
| Relay returns 502 | Check **CloudWatch → Log groups → /aws/lambda/medilog-relay-…** for `upstream error <status>`. |
| Relay returns 503 | The function has no access token. Re-run `deploy.sh` with `MEDILOG_ACCESS_TOKEN` set. |

To remove everything: `aws cloudformation delete-stack --stack-name medilog-relay --region ap-southeast-2`.
