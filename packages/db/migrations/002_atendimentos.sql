-- Trilha de auditoria de cada pedido feito ao agente: o que o modelo chamou, quanto tempo levou,
-- quanto custou e como terminou. O backend grava a linha no início e a completa no fim.
create table atendimentos (
  id              uuid primary key,
  pedido          text not null,
  solicitante     text,
  resultado       text check (resultado in ('criada', 'nao_atendida', 'erro')),
  mensagem        text,
  modelo          text,
  tokens_entrada  integer,
  tokens_saida    integer,
  custo_usd       numeric(12, 6),
  duracao_ms      integer,
  chamadas        jsonb not null default '[]',
  erro_codigo     text,
  idempotency_key text unique,
  criado_em       timestamptz not null default now()
);

create index atendimentos_criado_em_idx on atendimentos (criado_em desc);
