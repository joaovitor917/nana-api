# Padrões de segurança OWASP

Mapeamento entre os riscos catalogados pela OWASP e o que este projeto faz.
Onde não há proteção suficiente, está escrito.

## OWASP API Security Top 10 (2023)

### API1 — Autorização quebrada em nível de objeto
*Acessar o registro de outra pessoa trocando o identificador na requisição.*

É o risco número um de qualquer API, e o mais fácil de errar. Aqui, toda regra
começa por `request.auth.uid == uid`: o identificador vem do token assinado pelo
Firebase, não de um parâmetro que o cliente escolhe. Trocar o `uid` na chamada
não adianta, porque o token não acompanha.

Além disso, listar a coleção `maes` é proibido para todo mundo. Sem isso,
alguém poderia varrer a base inteira sem precisar adivinhar identificador.

### API2 — Autenticação quebrada
Firebase Auth cuida de senha, token e renovação. O projeto acrescenta:

- escrita só com e-mail verificado;
- política de senha configurada no console, ver `README.md`;
- proteção contra enumeração de e-mail ativada no console;
- token expira em 1 hora e pode ser revogado no servidor.

### API3 — Autorização quebrada em nível de propriedade
*Gravar ou ler campos que não deveriam estar ali.*

As regras usam lista fechada de campos (`hasOnly`). Campo fora da lista faz a
escrita inteira falhar. É o que impede o app de criar um campo novo com dado
pessoal que ninguém mapeou, e impede que um cliente modificado grave lixo.

Nos registros de auditoria isso vai mais longe: só o **nome** do campo alterado
é aceito, nunca o valor.

### API4 — Consumo irrestrito de recursos
**Parcialmente coberto.** Há intervalo mínimo de 3 segundos entre atualizações
de perfil, limite de tamanho em todo texto e limite de itens nas listas.

Não há limite por minuto nem por IP. Ative o **App Check**, que funciona no
plano gratuito, e configure alerta de orçamento no Google Cloud.

### API5 — Autorização quebrada em nível de função
Não existe caminho administrativo exposto ao app. A coleção `_operacoes_admin`
é negada a qualquer cliente: só o Admin SDK chega nela, e ele roda fora do
celular, na máquina de quem administra.

### API6 — Acesso irrestrito a fluxos sensíveis de negócio
Gravar a autodeclaração racial exige consentimento registrado antes. A exclusão
de conta não passa pelo app: é operação administrativa, com confirmação
explícita e exportação de segurança antes de apagar.

### API7 — Falsificação de requisição no servidor (SSRF)
Não se aplica: não há servidor nosso fazendo requisição para lugar nenhum.

### API8 — Configuração indevida de segurança
- As regras negam por padrão; só o que está escrito é liberado.
- O Storage está fechado por completo, já que o app não guarda arquivo.
- Índices de busca desligados nos campos pessoais, o que reduz o que uma
  consulta inesperada conseguiria alcançar.
- A chave de serviço nunca entra no repositório.

### API9 — Gestão inadequada de inventário
`docs/MODELO-DE-DADOS.md` lista todos os caminhos que existem. Qualquer outro é
negado. Manter essa tabela atualizada faz parte de mexer no projeto.

### API10 — Consumo inseguro de API de terceiros
Não se aplica: o projeto não consome API externa.

## OWASP Mobile Top 10 (2024)

O que cabe ao lado do servidor:

| Risco | Situação |
|---|---|
| M1 — Credencial indevida | nenhuma senha ou chave no app; o token vem do Firebase Auth |
| M2 — Segurança inadequada da cadeia de suprimentos | dependências com versão fixada; `npm audit` antes de publicar |
| M3 — Autenticação ou autorização insegura | decidido no servidor, pelas regras, nunca pela interface |
| M4 — Validação de entrada insuficiente | validação no servidor; a do app é conveniência, não proteção |
| M5 — Comunicação insegura | TLS obrigatório pelo SDK, sem jeito de desligar |
| M6 — Controle de privacidade inadequado | consentimento registrado, exportação e exclusão funcionando |
| M7 — Proteção insuficiente do binário | **não coberto.** Ofuscação não impede nada: a defesa é o servidor não confiar no app |
| M8 — Configuração incorreta | regras negam por padrão; App Check recomendado |
| M9 — Armazenamento inseguro | **atenção:** o SDK guarda cache offline no aparelho. Ver abaixo |
| M10 — Criptografia insuficiente | TLS em trânsito; AES-256 em repouso, pelo Google |

### Sobre o M9, que vale um parágrafo

O SDK do Firestore mantém um cache local no celular para funcionar sem
internet. Isso é ótimo para a usuária e é um dado pessoal a mais no aparelho.
Num celular comum não é alcançável por outro aplicativo, mas num aparelho com
root, sim.

Duas decisões a tomar:

1. **Limpar o cache ao sair da conta.** Chamar `clearPersistence()` depois do
   logout. Sem isso, os dados continuam no aparelho depois que a pessoa sai.
2. **Decidir se o cache offline compensa.** Dá para desligá-lo. O app fica
   inutilizável sem internet, o que para o público do Nanã é um custo real.
   A recomendação é manter ligado e limpar ao sair.

## OWASP MASVS

Para o nível L1, que é o adequado a um app desta natureza, o que depende do
servidor está coberto: autenticação, autorização, validação e transporte.

O que fica no app Android e precisa de uma passada da equipe:

- não escrever dado pessoal em log (`Log.d`) nas versões de produção;
- não guardar dado pessoal em `SharedPreferences` sem proteção;
- limpar o cache do Firestore ao sair da conta;
- bloquear captura de tela nas telas com dado sensível, se a equipe julgar
  necessário (`FLAG_SECURE`).

## Ativar o App Check

É a medida de melhor retorno disponível no plano gratuito, e ainda não está
ligada. Ela garante que as requisições venham do app de verdade, não de um
script.

1. No console do Firebase, **App Check**, registre o app Android com
   **Play Integrity**.
2. Adicione a dependência `com.google.firebase:firebase-appcheck-playintegrity`.
3. Deixe em modo de monitoramento por alguns dias e veja o painel.
4. Quando o tráfego legítimo estiver passando, ative a obrigatoriedade no
   Firestore.

Ligar a obrigatoriedade antes de conferir o painel derruba o app de quem já
está usando. Não pule o passo 3.
