import { Router } from 'express';
import * as controller from './card.controller';

export const commentRouter = Router();

commentRouter.patch('/:comment_id', controller.updateComment);
commentRouter.delete('/:comment_id', controller.deleteComment);
