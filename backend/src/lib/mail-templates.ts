import type { MailOptions } from './mailer';

type TemplateMailOptions = Omit<MailOptions, 'to'>;

export function inviteEmail(workspaceName: string, inviteUrl: string): TemplateMailOptions {
  const subject = `${workspaceName}에서 당신을 초대했습니다`;
  return {
    subject,
    text: `${workspaceName}에서 당신을 초대했습니다.\n\n링크를 클릭하여 참여하세요:\n${inviteUrl}`,
    html: `<h2>${workspaceName}</h2><p>워크스페이스에 초대되었습니다.</p><p><a href="${inviteUrl}">워크스페이스 참여하기</a></p>`,
  };
}
