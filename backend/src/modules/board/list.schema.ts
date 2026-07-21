import { z } from "zod";

export const createListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "name is required" })
    .max(100, { message: "name must be 100 chars or less" }),
});

export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "name is required" })
    .max(100, { message: "name must be 100 chars or less" }),
});

export type UpdateListInput = z.infer<typeof updateListSchema>;

export const reorderListSchema = z
  .object({
    before_list_id: z.string().uuid().nullable().optional(),
    after_list_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => !(v.before_list_id && v.after_list_id && v.before_list_id === v.after_list_id),
    { message: "before_list_id and after_list_id cannot be the same" },
  );

export type ReorderListInput = z.infer<typeof reorderListSchema>;
