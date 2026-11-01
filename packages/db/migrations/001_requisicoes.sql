-- Requisição de compra e seus itens. Preço e título são copiados no momento da compra,
-- porque o catálogo pode mudar depois.
create sequence requisicao_numero_seq;

create table requisicoes (
  id               bigint generated always as identity primary key,
  numero           text not null unique
                   default 'REQ-' || lpad(nextval('requisicao_numero_seq')::text, 6, '0'),
  solicitante      text,
  justificativa    text not null,
  status           text not null check (status in ('aprovada', 'em_aprovacao', 'reprovada')),
  valor_total      numeric(12, 2) not null check (valor_total >= 0),
  moeda            text not null default 'USD',
  regras_aplicadas jsonb not null,
  atendimento_id   uuid,
  criado_em        timestamptz not null default now()
);

create index requisicoes_criado_em_idx on requisicoes (criado_em desc, id desc);
create index requisicoes_atendimento_idx on requisicoes (atendimento_id);

create table requisicao_itens (
  id             bigint generated always as identity primary key,
  requisicao_id  bigint not null references requisicoes (id) on delete cascade,
  produto_id     integer not null,
  titulo         text not null,
  categoria      text not null,
  preco_unitario numeric(12, 2) not null check (preco_unitario >= 0),
  quantidade     integer not null check (quantidade > 0),
  subtotal       numeric(12, 2) not null check (subtotal >= 0),
  check (subtotal = preco_unitario * quantidade),
  unique (requisicao_id, produto_id)
);

alter sequence requisicao_numero_seq owned by requisicoes.numero;
