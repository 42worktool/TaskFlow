import { Router } from 'express';
import * as controller from './card.controller';

export const cardRouter = Router();

// More specific routes before wildcard /:card_id
cardRouter.delete('/attachments/:attachment_id', controller.removeAttachment);

cardRouter.get('/:card_id', controller.getCard);
cardRouter.put('/:card_id', controller.updateCard);
cardRouter.delete('/:card_id', controller.deleteCard);
cardRouter.put('/:card_id/order', controller.reorderCard);
cardRouter.put('/:card_id/move', controller.moveCard);
cardRouter.patch('/:card_id/dates', controller.updateCardDates);
cardRouter.put('/:card_id/inbox', controller.moveCardToInbox);
cardRouter.post('/:card_id/members', controller.addCardMember);
cardRouter.delete('/:card_id/members/:user_id', controller.removeCardMember);
cardRouter.post('/:card_id/attachments', controller.addAttachment);
cardRouter.post('/:card_id/comments', controller.createComment);
