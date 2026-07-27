import type { MailOptions } from './mailer';

type TemplateMailOptions = Omit<MailOptions, 'to'>;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!,
  );
}

export function inviteEmail(workspaceName: string, inviteUrl: string): TemplateMailOptions {
  const subject = `${workspaceName}에서 당신을 초대했습니다`;
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviteUrl = escapeHtml(inviteUrl);

  return {
    subject,
    text: `${workspaceName}에서 당신을 초대했습니다.\n\n링크를 클릭하여 참여하세요:\n${inviteUrl}`,
    html: `<h2>${safeWorkspaceName}</h2><p>워크스페이스에 초대되었습니다.</p><p><a href="${safeInviteUrl}">워크스페이스 참여하기</a></p>`,
  };
}
