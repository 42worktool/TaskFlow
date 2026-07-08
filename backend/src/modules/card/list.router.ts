import { Router } from 'express';
import * as controller from './card.controller';

// Handles POST /api/lists/:list_id/cards
export const listCardRouter = Router();

listCardRouter.post('/:list_id/cards', controller.createCard);
