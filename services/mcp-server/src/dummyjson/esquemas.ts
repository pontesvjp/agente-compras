import { z } from 'zod';

/** Campos pedidos à DummyJSON com `select=` na busca. */
export const CAMPOS_BUSCA = [
  'id',
  'title',
  'price',
  'stock',
  'minimumOrderQuantity',
  'availabilityStatus',
  'category',
  'brand',
  'rating',
] as const;

export const produtoDummySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  minimumOrderQuantity: z.number().int().positive().default(1),
  availabilityStatus: z.string().default('Unknown'),
  category: z.string(),
  brand: z.string().optional(),
  rating: z.number().default(0),
});
export type ProdutoDummy = z.infer<typeof produtoDummySchema>;

export const buscaDummySchema = z.object({
  products: z.array(produtoDummySchema),
  total: z.number().int().nonnegative(),
});

export const produtoDummyDetalhadoSchema = produtoDummySchema.extend({
  description: z.string().default(''),
  warrantyInformation: z.string().optional(),
  shippingInformation: z.string().optional(),
  returnPolicy: z.string().optional(),
});
export type ProdutoDummyDetalhado = z.infer<typeof produtoDummyDetalhadoSchema>;
