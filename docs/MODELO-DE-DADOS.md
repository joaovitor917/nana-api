# Modelo de dados no Firestore

Tradução do documento **"Banco de Dados – Nanã", versão 0.2**, do modelo
relacional para o jeito do Firestore.

## Por que a estrutura não é igual à do documento

O documento foi escrito pensando em tabelas: cada entidade tem um `id` próprio
e as outras apontam para ele com um `id_mae`. Isso é o certo num banco
relacional como PostgreSQL ou MySQL.

O Firestore não funciona assim. Nele, os dados de uma pessoa ficam **dentro**
do documento dela, em subcoleções. Isso muda duas coisas para melhor:

1. **A segurança fica no caminho.** `maes/{uid}/diario_cuidado/...` só pode ser
   lido por quem tem aquele `uid` no token. Não existe como pedir o registro de
   outra pessoa, porque o endereço do dado já carrega de quem ele é. Num modelo
   com `id_mae` dentro do documento, cada consulta precisaria conferir esse
   campo, e basta esquecer uma vez para vazar.
2. **Some o campo `id_mae`.** Ele vira o caminho. Menos um campo para manter em
   sincronia e menos uma chance de erro.

Os relacionamentos do documento continuam valendo; só mudam de forma:

| Documento (seção 6) | No Firestore |
|---|---|
| Mães 1:1 Perfis de acolhimento | subcoleção com documento de id fixo `principal` |
| Mães 1:N Diário de cuidado | subcoleção `diario_cuidado` |
| Mães 1:N Preferências de conteúdo | subcoleção `preferencias_conteudo` |
| Mães 1:N Consultas | subcoleção `consultas` (ainda não implementada) |
| Mães N:N Conversas | coleção `chats` + subcoleção `membros/{uid}` |

## Estrutura

```
maes/{uid}                                  ← uid = identificador do Firebase Auth
├── (dados do cadastro)
├── perfil_acolhimento/principal            ← relação 1:1
├── diario_cuidado/{aaaa-mm-dd}             ← relação 1:N
├── preferencias_conteudo/{CATEGORIA}       ← relação 1:N
├── consentimentos/{finalidade}             ← LGPD
├── consentimentos_historico/{id}           ← LGPD, imutável
└── auditoria/{id}                          ← Marco Civil, imutável

chats/{chatId}                              ← criado só pela equipe (admin/criar-chat.js)
├── membros/{uid}                           ← relação N:N com Mães
├── mensagens/{uid_entrada_n}               ← Regra 5: só participantes leem
└── digitando/{uid}                         ← o "..." de quem está escrevendo

conteudos/{id}                              ← Regra 6: só "publicado" aparece
```

### `maes/{uid}` — entidade Mães

O identificador do documento é o **UID do Firebase Authentication**. Não existe
campo `id_mae`, e **não existe `senha_hash`**: ver `REVISAO-DO-DOCUMENTO.md`.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `status` | string | sim | `ativa`, `inativa` ou `encerrada` |
| `dataCadastro` | timestamp | sim | relógio do servidor, imutável |
| `atualizadoEm` | timestamp | sim | relógio do servidor |
| `nome` | string | não | até 60 caracteres |
| `idade` | número | não | entre 10 e 70 |
| `dataNascimento` | timestamp | não | ver divergência 4 |
| `versaoPolitica` | string | não | versão dos termos aceitos |

O **e-mail não fica aqui**: quem guarda é o Firebase Authentication, que também
garante sozinho que não haja dois cadastros com o mesmo e-mail — a Regra 1 do
documento. Duplicar o e-mail no Firestore criaria dois lugares para atualizar e
dois para apagar quando a mãe pedir exclusão.

### `maes/{uid}/perfil_acolhimento/principal` — entidade Perfis de acolhimento

O id fixo `principal` é o que garante a relação 1:1: não há como existir um
segundo perfil para a mesma mãe, porque o endereço é sempre o mesmo.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `fasePosParto` | string | **sim** | uma das 5 fases do app |
| `nomeBebe` | string | não | até 80 caracteres |
| `dataNascimentoBebe` | timestamp | não | |
| `cidade` | string | não | até 60 caracteres |
| `quantidadeFilhos` | string | não | `UM`, `DOIS`, `TRES_OU_MAIS` |
| `autodeclaracao` | string | não | **dado sensível**, exige consentimento |
| `atualizadoEm` | timestamp | sim | relógio do servidor |

Fases aceitas: `GESTACAO`, `POS_PARTO_0_45_DIAS`, `POS_PARTO_46_DIAS_6_MESES`,
`MATERNIDADE_6_MESES_1_ANO`, `MATERNIDADE_1_2_ANOS`.

Autodeclaração aceita: `PRETA`, `PARDA`, `PREFIRO_NAO_DIZER`.

### `maes/{uid}/diario_cuidado/{aaaa-mm-dd}` — entidade Diário de cuidado

**O id do documento é a própria data**, no formato `2026-11-22`. Isso resolve
de graça uma coisa que custaria uma consulta: garantir um registro por dia.
Registrar de novo no mesmo dia substitui o anterior.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `dataRegistro` | string | sim | igual ao id do documento |
| `sentimento` | string | não | `BEM`, `CALMA`, `ANSIOSA`, `CANSADA`, `TRISTE` |
| `sintomas` | string | não | **dado de saúde**, exige consentimento |
| `descricao` | string | não | até 2000 caracteres |
| `criadoEm` | timestamp | sim | relógio do servidor, imutável |
| `atualizadoEm` | timestamp | sim | relógio do servidor |

Um registro precisa ter ao menos um entre sentimento, sintomas e descrição.
Registro vazio é recusado.

### `maes/{uid}/preferencias_conteudo/{CATEGORIA}` — entidade Preferências

O id do documento é a categoria, o que impede duas preferências conflitantes
para a mesma coisa.

| Campo | Tipo | Obrigatório |
|---|---|---|
| `categoria` | string | sim, igual ao id |
| `ativo` | booleano | sim |
| `atualizadoEm` | timestamp | sim |

Categorias: `AMAMENTACAO`, `SAUDE_MENTAL`, `MEUS_DIREITOS`, `SONO_DO_BEBE`,
`REDE_DE_APOIO`, `PARTO`. São as mesmas que a mãe escolhe no cadastro do app.

### `maes/{uid}/consentimentos/{finalidade}`

Guarda a decisão **atual** de cada finalidade. Finalidades em uso:

| Finalidade | Libera o campo |
|---|---|
| `raca_autodeclarada` | `autodeclaracao`, no perfil |
| `dados_de_saude` | `sintomas`, no diário |

| Campo | Tipo |
|---|---|
| `finalidade` | string, igual ao id |
| `concedido` | booleano |
| `versaoTexto` | string |
| `registradoEm` | timestamp do servidor |

Revogar é gravar de novo com `concedido: false`.

### `maes/{uid}/auditoria/{id}`

Guarda só o **nome** dos campos tocados, nunca o valor. Um log não deve virar
uma segunda cópia dos dados pessoais.

Ações aceitas: `CADASTRO_CRIADO`, `PERFIL_ATUALIZADO`, `PERFIL_LIDO`,
`DIARIO_REGISTRADO`, `DIARIO_APAGADO`, `PREFERENCIAS_ALTERADAS`,
`DADOS_EXPORTADOS`, `CONSENTIMENTO_ALTERADO`, `SESSAO_INICIADA`.

## Ordem das operações

Duas sequências importam, porque as regras consultam o consentimento no
momento da gravação:

**Primeiro acesso**

1. Criar a conta no Firebase Auth e enviar o e-mail de verificação.
2. A mãe verifica o e-mail. Sem isso, nenhuma escrita passa.
3. Gravar o consentimento, se ela escolher informar a autodeclaração racial.
4. Criar `maes/{uid}` e depois `perfil_acolhimento/principal`.

**Registrar sintomas no diário**

1. Gravar o consentimento `dados_de_saude`.
2. Só então gravar o registro com o campo `sintomas`.

Na ordem invertida, a gravação é recusada pelo servidor.

## Conversas e Mensagens (aba Apoio)

| Documento | Campos | Observação |
|---|---|---|
| `chats/{chatId}` | `nome`, `participantes`, `criadoEm` | Sem dado pessoal. Visível para quem tem e-mail verificado, para poder escolher em qual entrar. O app só mexe em `participantes`, e só junto com a própria entrada ou saída. |
| `membros/{uid}` | `nome`, `entrouEm`, `lidoEm`, `ultimaMensagemEm`, `enviadas` | `nome` é nulo quando a mãe desliga "Mostrar meu nome nos chats"; aí aparece "Participante". |
| `mensagens/{id}` | `autora`, `texto` (até 1000), `enviadaEm`, `curtidas` | Não guarda nome: o nome vem de `membros`, então desligar a opção esconde o nome também nas mensagens antigas. |
| `digitando/{uid}` | `em` | Gravado no máximo a cada 3 s. |

**Regra 5.** Ler mensagens exige o documento `membros/{uid}` da própria mãe, e
o uid vem do token. Fora do chat, ela só alcança as mensagens que ela mesma
escreveu, para poder apagá-las ao excluir a conta.

**Limite de envio (OWASP API4).** Uma mensagem a cada 2 segundos. O id da
mensagem é `{uid}_{entrada em ms}_{n}`, onde `n` é o contador `enviadas`, que
só sobe um por gravação: assim não dá para mandar centenas de mensagens num
lote só.

**Exclusão e portabilidade.** O app apaga as mensagens da mãe e a tira dos
chats antes de encerrar a conta, e inclui as mensagens dela na exportação. Os
scripts `admin/excluir-conta.js` e `admin/exportar-dados.js` fazem o mesmo.
Mensagens de outras participantes nunca entram na exportação.

## Conteúdos

Materiais educativos escritos pela equipe a partir de fontes científicas. O
texto fica em `dados/conteudos.json` e é carregado com
`admin/importar-conteudos.js` (ou `IMPORTAR-CONTEUDOS.bat`).

| Campo | Tipo | Observação |
|---|---|---|
| `titulo`, `descricao`, `texto` | string | `texto` em parágrafos separados por linha em branco |
| `categoria` | string | `SAUDE_NA_GESTACAO`, `POS_PARTO`, `SAUDE_MENTAL`, `MEUS_DIREITOS` |
| `tipo` | string | `ARTIGO` |
| `status` | string | `publicado` ou `rascunho` (Regra 6) |
| `ordem` | número | ordem de exibição |
| `fontes` | lista | cada uma com `referencia`, `tipo`, `doi`, `url` |
| `dataPublicacao`, `atualizadoEm` | timestamp | preenchidos pelo script |

Todo conteúdo de saúde precisa de pelo menos uma fonte: o script recusa sem.
O app só lê, e só o que está publicado; ninguém escreve pelo celular.

## O que ainda não existe

Consultas estão no documento do grupo, mas ainda não têm
tela no aplicativo. As regras **negam** essas coleções por
enquanto. Coleção liberada "para quando for usada" é exatamente como banco de
dados vaza.

Quando forem implementadas, dois pontos exigem atenção:

