-- Cada atendimento grava no máximo uma requisição: o modelo não consegue fracionar a compra em
-- várias abaixo da alçada. Requisição sem atendimento (MCP chamado direto) continua livre.
drop index requisicoes_atendimento_idx;

-- Num banco antigo, um atendimento pode ter gravado mais de uma: a mais recente fica ligada a ele
-- e as outras ficam soltas, sem apagar nada.
update requisicoes r
   set atendimento_id = null
 where atendimento_id is not null
   and exists (select 1 from requisicoes o where o.atendimento_id = r.atendimento_id and o.id > r.id);

create unique index requisicoes_um_por_atendimento on requisicoes (atendimento_id)
  where atendimento_id is not null;

-- "not valid" só deixa de conferir as linhas que já existem, para a migration não travar o boot
-- num banco antigo; toda linha nova é conferida.
alter table requisicoes
  add constraint requisicoes_atendimento_fk
  foreign key (atendimento_id) references atendimentos (id) not valid;
