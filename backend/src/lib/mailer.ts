import { createTransport } from 'nodemailer'
import { config } from '../config'

const transporter = createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
})

export interface MailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

export async function sendMail(options: MailOptions): Promise<void> {
  await transporter.sendMail({
    from: config.smtp.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}
