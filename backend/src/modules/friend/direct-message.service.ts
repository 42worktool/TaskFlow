import { prisma } from '../../db'
import { AppError } from '../../errors'
import { MESSAGE_HISTORY_LIMIT, newestMessageOrder } from '../../lib/messaging'
import { realtime } from '../../realtime'
import {
  directMessageDtoSchema,
  directMessageInclude,
  toDirectMessageDto,
  type DirectMessageDto,
} from './direct-message.dto'
import { canonicalFriendPair } from './friend-pair'

class FriendshipRequiredError extends AppError {
  constructor() {
    super(
      'FRIENDSHIP_REQUIRED',
      403,
      'an accepted friendship is required to exchange direct messages',
    )
  }
}

async function requireAcceptedFriendship(userId: string, friendUserId: string): Promise<void> {
  // DM은 수락된 친구 관계가 있을 때만 허용하며 자신에게 보내는 대화방은 만들지 않는다.
  if (userId === friendUserId) throw new FriendshipRequiredError()

  const pair = canonicalFriendPair(userId, friendUserId)
  const friendship = await prisma.friendship.findUnique({
    where: { user_low_id_user_high_id: pair },
    select: { user_low_id: true },
  })
  if (!friendship) throw new FriendshipRequiredError()
}

function publishDirectMessageCreated(message: DirectMessageDto): void {
  try {
    const event = directMessageDtoSchema.parse(message)
    realtime.sendToUsers(
      [event.author.user_id, event.recipient.user_id],
      'dm.message_created',
      event,
    )
  } catch (error) {
    console.warn(
      '[realtime] failed to publish "dm.message_created"',
      error instanceof Error ? error.message : error,
    )
  }
}

export async function listDirectMessages(input: { userId: string; friendUserId: string }) {
  await requireAcceptedFriendship(input.userId, input.friendUserId)

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        {
          sender_user_id: input.userId,
          recipient_user_id: input.friendUserId,
        },
        {
          sender_user_id: input.friendUserId,
          recipient_user_id: input.userId,
        },
      ],
    },
    include: directMessageInclude,
    orderBy: newestMessageOrder,
    take: MESSAGE_HISTORY_LIMIT,
  })

  // 인덱스를 활용해 최신 N개를 역순 조회한 뒤 화면 표시용 시간순으로 뒤집는다.
  return messages.reverse().map(toDirectMessageDto)
}

export async function createDirectMessage(input: {
  userId: string
  friendUserId: string
  content: string
}) {
  await requireAcceptedFriendship(input.userId, input.friendUserId)

  const message = await prisma.directMessage.create({
    data: {
      sender_user_id: input.userId,
      recipient_user_id: input.friendUserId,
      content: input.content,
    },
    include: directMessageInclude,
  })
  const dto = toDirectMessageDto(message)

  // 메시지를 DB에 먼저 저장하고 발신자/수신자의 모든 탭에 같은 DTO를 전송한다.
  publishDirectMessageCreated(dto)
  return dto
}
