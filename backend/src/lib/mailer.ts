// SMTP 전송기 생성과 실제 메일 발송을 캡슐화해 큐가 메일 서버 설정에 의존하지 않게 한다.
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
