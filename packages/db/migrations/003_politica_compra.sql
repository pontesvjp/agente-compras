-- Política de compras: regra de negócio do cliente, lida a cada pedido e alterável sem deploy.
create table politica_compra (
  id                          smallint primary key default 1 check (id = 1),
  criterio_escolha            text not null check (criterio_escolha in ('menor_preco', 'melhor_avaliacao')),
  alcada_usd                  numeric(12, 2) not null check (alcada_usd >= 0),
  valor_maximo_requisicao_usd numeric(12, 2) not null check (valor_maximo_requisicao_usd > 0),
  atualizado_em               timestamptz not null default now()
);

create table regras_categoria (
  categoria         text primary key check (categoria = lower(categoria)),
  permitida         boolean not null default true,
  teto_unitario_usd numeric(12, 2) check (teto_unitario_usd > 0),
  quantidade_maxima integer check (quantidade_maxima > 0),
  alcada_usd        numeric(12, 2) check (alcada_usd >= 0),
  motivo            text,
  atualizado_em     timestamptz not null default now(),
  check (permitida or motivo is not null)
);

create function marcar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger politica_compra_atualizado_em
before update on politica_compra
for each row execute function marcar_atualizado_em();

create trigger regras_categoria_atualizado_em
before update on regras_categoria
for each row execute function marcar_atualizado_em();

-- Toda alteração da política fica registrada, com o antes e o depois, a partir da carga inicial.
create table politica_historico (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  chave       text not null,
  operacao    text not null,
  antes       jsonb,
  depois      jsonb,
  alterado_em timestamptz not null default now()
);

create function registrar_politica_historico() returns trigger
language plpgsql as $$
declare
  linha jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  insert into politica_historico (tabela, chave, operacao, antes, depois)
  values (
    tg_table_name,
    case tg_table_name when 'regras_categoria' then linha ->> 'categoria' else linha ->> 'id' end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger politica_compra_historico
after insert or update or delete on politica_compra
for each row execute function registrar_politica_historico();

create trigger regras_categoria_historico
after insert or update or delete on regras_categoria
for each row execute function registrar_politica_historico();

-- Carga inicial: o ambiente sobe pronto na máquina de quem avalia, sem passo manual.
insert into politica_compra (criterio_escolha, alcada_usd, valor_maximo_requisicao_usd)
values ('menor_preco', 5000.00, 20000.00);

insert into regras_categoria (categoria, permitida, teto_unitario_usd, quantidade_maxima, alcada_usd, motivo) values
  ('laptops',    true,  2500.00, 20,   null,    null),
  ('furniture',  true,  null,    null, 2000.00, null),
  ('vehicle',    false, null,    null, null,    'veículo segue o processo de frota'),
  ('motorcycle', false, null,    null, null,    'veículo segue o processo de frota'),
  ('fragrances', false, null,    null, null,    'fora da política de compras corporativas'),
  ('beauty',     false, null,    null, null,    'fora da política de compras corporativas'),
  ('skin-care',  false, null,    null, null,    'fora da política de compras corporativas');
