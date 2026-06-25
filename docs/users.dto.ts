// ============================================================
// users.dto.ts — Users (공개 프로필)
// ============================================================
import { UUID, ISODateString } from './common.dto';

// ------------------------------------------------------------
// GET /users/{user_id}/profile  → 200
//   "공개" 프로필이므로 email 같은 민감 정보는 노출하지 않는다.
//   ⚠️ 로그인 유저 본인 정보는 GET /auth/me (UserPublic) 를 쓸 것.
//      여기는 "남이 보는 나"라서 email 을 뺀다.
// ------------------------------------------------------------
export interface UserProfile {
  id: UUID;
  name: string;
  profile_image_url: string | null;
  created_at: ISODateString;
}
export type GetUserProfileResponse = UserProfile;

// ------------------------------------------------------------
// PUT /users/{user_id}/profile  → 200
//   닉네임 / 프로필 이미지 변경.
//   DBML Users 에 있는 변경 가능 필드는 name, profile_image_url 뿐.
//   ⚠️ 부분 수정을 원하면 PATCH 로 두고 아래 필드를 optional 로.
//      (현재는 명세상 PUT 이므로 "둘 다 보낸다" 전제. 둘 다 optional 로
//       열어두되, 서버가 '키 존재 여부'로 부분 반영 처리하는 것을 권장)
// ------------------------------------------------------------
export interface UpdateUserProfileRequest {
  name?: string;
  profile_image_url?: string | null;   // null 로 보내면 이미지 제거
}
export type UpdateUserProfileResponse = UserProfile;
