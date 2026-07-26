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

export function welcomeEmail(userName: string, appOrigin: string): TemplateMailOptions {
  return {
    subject: 'TaskFlow에 오신 것을 환영합니다',
    text: `${userName}님, TaskFlow에 가입해 주셔서 감사합니다.\n\n시작하기: ${appOrigin}`,
    html: `<h2>환영합니다!</h2><p>${userName}님, TaskFlow에 가입해 주셔서 감사합니다.</p><p><a href="${appOrigin}">시작하기</a></p>`,
  };
}

export function passwordResetEmail(userName: string, resetUrl: string): TemplateMailOptions {
  return {
    subject: '비밀번호 재설정',
    text: `${userName}님, 비밀번호 재설정을 요청하셨습니다.\n\n다음 링크를 클릭하여 비밀번호를 재설정하세요:\n${resetUrl}`,
    html: `<h2>비밀번호 재설정</h2><p>${userName}님, 비밀번호 재설정을 요청하셨습니다.</p><p><a href="${resetUrl}">비밀번호 재설정하기</a></p>`,
  };
}
