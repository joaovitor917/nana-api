# Contrato da API

Sem Cloud Functions, a API do Nanã **é o próprio Firestore**, acessado pelo SDK
oficial do Firebase. Não há endereços `/api/v1/...`: há caminhos de documento e
operações, e as regras de segurança decidem o que cada uma pode fazer.

Isso não é um atalho. As regras rodam nos servidores do Google, não no celular,
então o aplicativo não consegue contorná-las nem com o APK modificado.

## Inventário completo

Tudo o que existe está listado aqui. Qualquer caminho fora desta tabela é negado.
Manter este inventário atualizado é o que evita o risco API9 da OWASP
(gestão inadequada de inventário).

| Caminho | Operação | Quem pode | Observação |
|---|---|---|---|
| `usuarias/{uid}` | ler | a dona | só o próprio documento |
| `usuarias/{uid}` | criar | a dona | exige e-mail verificado |
| `usuarias/{uid}` | atualizar | a dona | 1 escrita a cada 3 s |
| `usuarias/{uid}` | apagar | **ninguém** | só pelo script administrativo |
| `usuarias` | listar | **ninguém** | impede varrer a base |
| `usuarias/{uid}/consentimentos/{finalidade}` | ler, criar, atualizar | a dona | nunca apagar |
| `usuarias/{uid}/consentimentos_historico/{id}` | ler, criar | a dona | imutável |
| `usuarias/{uid}/auditoria/{id}` | ler, criar | a dona | imutável |
| `_operacoes_admin/{id}` | — | **ninguém pelo app** | só o Admin SDK |
| qualquer outro | — | **ninguém** | negado por padrão |

## Modelo de dados

### `usuarias/{uid}`

O `{uid}` é o identificador que o Firebase Auth gera. Nunca use o e-mail como
chave: ele muda e é dado pessoal.

| Campo | Tipo | Obrigatório | Limite |
|---|---|---|---|
| `fase` | string | **sim** | uma das 5 fases |
| `nome` | string | não | 60 caracteres |
| `idade` | número inteiro | não | entre 10 e 70 |
| `cidade` | string | não | 60 caracteres |
| `interesses` | lista de string | não | até 6, da lista fechada |
| `nomesBebes` | string | não | 80 caracteres |
| `quantidadeFilhos` | string | não | `UM`, `DOIS`, `TRES_OU_MAIS` |
| `autodeclaracao` | string | não | `PRETA`, `PARDA`, `PREFIRO_NAO_DIZER` |
| `criadoEm` | timestamp | sim | relógio do servidor, imutável |
| `atualizadoEm` | timestamp | sim | relógio do servidor |
| `versaoPolitica` | string | não | 20 caracteres |

A `fase` é o único campo necessário porque a tela inicial depende dela. Isso
espelha a regra do app em `data/RegrasCadastro.kt`, e as duas precisam andar
juntas: se a equipe mudar lá, tem que mudar aqui também.

**A `autodeclaracao` só é aceita se existir consentimento concedido**, por ser
dado pessoal sensível (LGPD, art. 5º, II e art. 11, I).

### `usuarias/{uid}/consentimentos/{finalidade}`

Guarda a decisão **atual** de cada finalidade. O identificador do documento é a
própria finalidade, o que impede dois registros conflitantes para a mesma coisa.

| Campo | Tipo | Observação |
|---|---|---|
| `finalidade` | string | tem que ser igual ao nome do documento |
| `concedido` | booleano | `false` registra a revogação |
| `versaoTexto` | string | qual versão do texto foi aceita |
| `registradoEm` | timestamp | relógio do servidor |

Finalidade já prevista: `raca_autodeclarada`.

Revogar é só gravar de novo com `concedido: false`. A LGPD (art. 8º, §5º) exige
que revogar seja tão fácil quanto consentir.

### `usuarias/{uid}/consentimentos_historico/{id}`

Mesmos campos. Cada decisão também entra aqui e **nunca mais muda**. É o que
comprova o que foi aceito e quando (art. 8º, §1º: o consentimento precisa ser
comprovável pelo controlador).

### `usuarias/{uid}/auditoria/{id}`

| Campo | Tipo | Observação |
|---|---|---|
| `acao` | string | lista fechada, ver abaixo |
| `campos` | lista de string | **só os nomes**, nunca os valores |
| `origem` | string | ex.: `android`, até 40 caracteres |
| `registradoEm` | timestamp | relógio do servidor |

Ações aceitas: `PERFIL_CRIADO`, `PERFIL_ATUALIZADO`, `PERFIL_LIDO`,
`DADOS_EXPORTADOS`, `CONSENTIMENTO_ALTERADO`, `SESSAO_INICIADA`.

Guardar o valor do campo transformaria o log numa segunda cópia dos dados
pessoais, com o agravante de ser uma cópia que ninguém lembra de proteger.
Por isso as regras recusam qualquer campo além dos quatro acima.

## Ordem das operações

Duas sequências importam:

**Primeiro acesso**

1. Criar a conta no Firebase Auth e enviar o e-mail de verificação.
2. A usuária verifica o e-mail. Sem isso, nenhuma escrita passa.
3. Gravar o consentimento, se ela escolher informar a autodeclaração racial.
4. Criar `usuarias/{uid}`.

O passo 3 vem antes do 4: as regras consultam o consentimento no momento em que
o perfil é gravado. Na ordem invertida, a gravação é recusada.

**Alteração**

1. Gravar o perfil com `atualizadoEm` = carimbo do servidor.
2. Gravar o registro de auditoria.

## Carimbos de tempo

Use sempre `FieldValue.serverTimestamp()`. As regras exigem que o valor seja
igual a `request.time`, ou seja, o relógio do servidor. Um aparelho com a data
alterada não consegue forjar o histórico, e carimbo enviado pelo celular é
recusado.

## O que o app precisa saber

- **Atualização parcial.** Numa atualização, o Firestore valida o documento
  **inteiro já mesclado**. Então a `fase` continua sendo exigida mesmo quando a
  usuária muda só o nome, porque ela já estava no documento.
- **Erro de permissão.** Qualquer violação volta como `PERMISSION_DENIED`, sem
  dizer qual regra falhou. Isso é proposital: mensagem detalhada ajudaria quem
  está sondando a base. Durante o desenvolvimento, use o emulador, que mostra a
  linha exata.
- **Modo offline.** O SDK aceita a escrita localmente e sincroniza depois. Se a
  regra recusar, o erro só aparece na sincronização. A interface precisa lidar
  com isso, não assumir que gravou.
