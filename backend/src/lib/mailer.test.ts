// Quick mail test – run with: npx tsx --env-file=.env src/lib/mailer.test.ts
import { sendMail } from './mailer';

async function main() {
  const testEmail = process.env.TEST_EMAIL_TO;
  if (!testEmail) {
    console.error('Set TEST_EMAIL_TO in .env to the recipient address for the test');
    process.exit(1);
  }

  console.log(`Sending test email to ${testEmail}...`);
  try {
    await sendMail({
      to: testEmail,
      subject: 'TaskFlow mail test',
      text: 'If you receive this, the mailer is working correctly.',
      html: '<h1>TaskFlow Mail Test</h1><p>The mailer is <strong>working</strong>.</p>',
    });
    console.log('Email sent successfully');
  } catch (err) {
    console.error('Failed to send email:', err);
    process.exit(1);
  }
}

main();
