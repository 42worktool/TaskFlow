// 메일 본문 생성과 HTML 이스케이프를 발송 계층에서 분리해 템플릿 출력을 안전하게 만든다.
import type { MailOptions } from './mailer'

type TemplateMailOptions = Omit<MailOptions, 'to'>

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  )
}

export function inviteEmail(workspaceName: string, inviteUrl: string): TemplateMailOptions {
  const subject = `${workspaceName}에서 당신을 초대했습니다`
  const safeWorkspaceName = escapeHtml(workspaceName)
  const safeInviteUrl = escapeHtml(inviteUrl)

  return {
    subject,
    text: `${workspaceName}에서 당신을 초대했습니다.\n\n링크를 클릭하여 참여하세요:\n${inviteUrl}`,
    html: `<h2>${safeWorkspaceName}</h2><p>워크스페이스에 초대되었습니다.</p><p><a href="${safeInviteUrl}">워크스페이스 참여하기</a></p>`,
  }
}
