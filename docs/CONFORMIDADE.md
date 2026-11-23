# Conformidade legal

> **Isto não é parecer jurídico.** Sou um assistente, não advogado. O que está
> aqui são as **medidas técnicas** que o código implementa e que *apoiam* a
> conformidade. Nenhuma delas, sozinha ou somada, torna o projeto conforme:
> isso depende de política de privacidade, encarregado de dados, contratos e
> análise de um profissional. As lacunas estão listadas no fim, sem maquiagem.

## LGPD — Lei 13.709/2018

| Artigo | O que exige | O que o código faz |
|---|---|---|
| art. 6º, III (necessidade) | coletar o mínimo | lista fechada de campos; só a `fase` é obrigatória; índices de busca desligados nos campos pessoais |
| art. 6º, VII (segurança) | proteger de acesso não autorizado | regras negam tudo por padrão; cada usuária só alcança o próprio documento |
| art. 6º, X (responsabilização) | demonstrar o cumprimento | auditoria imutável e diário das operações administrativas |
| art. 7º, I / art. 8º | consentimento | coleção `consentimentos`, com versão do texto e data do servidor |
| art. 8º, §1º | consentimento comprovável | `consentimentos_historico`, que não pode ser alterado nem apagado |
| art. 8º, §5º | revogar tão fácil quanto consentir | basta gravar `concedido: false`, mesma operação |
| art. 9º | transparência | `exportar-dados.js` devolve tudo o que existe sobre a pessoa |
| art. 11, I | sensível exige consentimento específico | autodeclaração racial **e sintomas de saúde** são recusados pelo servidor sem consentimento concedido |
| art. 15 / art. 16 | eliminar ao fim do tratamento | `excluir-conta.js`; `expurgar-logs.js` apaga auditoria vencida |
| art. 18, II | acesso aos dados | `exportar-dados.js` |
| art. 18, III | correção | o app atualiza o próprio perfil |
| art. 18, V | portabilidade | exportação em JSON, formato aberto |
| art. 18, VI | eliminação | `excluir-conta.js`, que remove também as subcoleções |
| art. 18, IX | revogar consentimento | gravar `concedido: false` |
| art. 37 | registro das operações | `_operacoes_admin`, inacessível pelo app |
| art. 46 | medidas de segurança | TLS, regras no servidor, e-mail verificado, limite de escrita |
| art. 48 | comunicar incidente | **não é código.** Precisa de procedimento escrito |

**Ponto de atenção sobre os dados sensíveis.** O projeto trata dois: origem racial e dados de saúde (os sintomas do diário). Os dois exigem consentimento próprio.

**Sobre a autodeclaração racial em particular.** É o campo mais delicado do
projeto. A LGPD trata origem racial como dado sensível e, no art. 11, exige
consentimento *destacado e específico*. O servidor recusa o campo sem esse
consentimento, mas isso é só a metade: o texto apresentado na tela precisa
explicar, em linguagem simples, para que serve. O Nanã já faz isso no cadastro.
Quem for mexer nessa tela depois precisa saber que não é um campo comum.

## Marco Civil da Internet — Lei 12.965/2014

| Artigo | O que exige | Situação |
|---|---|---|
| art. 7º, VII | não repassar dados a terceiros sem consentimento | nenhum dado sai do Firebase; não há analytics nem anúncio |
| art. 7º, VIII | informação clara sobre coleta e uso | tela de privacidade no cadastro **precisa ser reescrita**, ver lacunas |
| art. 7º, X | exclusão definitiva ao fim da relação | `excluir-conta.js` |
| art. 10, §1º | só entregar registros por ordem judicial | **procedimento, não código** |
| art. 13 | guarda de registros de conexão | não se aplica: isso é obrigação de provedor de conexão |
| art. 15 | guarda dos registros de acesso por 6 meses | **parcialmente atendido**, ver lacunas |
| art. 16, I | não guardar registro além do necessário | `expurgar-logs.js`, com mínimo de 183 dias |

## Decreto 8.771/2016

| Artigo | O que exige | O que o código faz |
|---|---|---|
| art. 13, I | controle estrito de acesso | Admin SDK só na máquina do administrador; chave fora do repositório |
| art. 13, II | autenticação de quem acessa | Firebase Auth para a usuária; chave de serviço para o administrador |
| art. 13, III | inventário de acessos | auditoria por usuária e `_operacoes_admin` |
| art. 13, IV | sigilo em qualquer meio | TLS em trânsito; criptografia em repouso do Google |
| art. 14 | padrão de segurança compatível | OWASP, ver `OWASP.md` |

## CDC — Lei 8.078/1990

| Artigo | O que exige | Situação |
|---|---|---|
| art. 6º, III | informação clara sobre o serviço | depende da política de privacidade |
| art. 43 | acesso aos dados em cadastro | `exportar-dados.js` |
| art. 43, §3º | correção imediata | o app corrige o próprio perfil |
| art. 43, §4º | dados claros e verdadeiros | validação no servidor recusa valor fora da lista |

## O que ainda falta

Esta é a parte que importa.

### 1. A tela de privacidade do app está desatualizada

Hoje o cadastro diz que os dados ficam **só no aparelho**. Com esta API, isso
deixa de ser verdade. Enquanto o texto não for corrigido, o app promete uma
coisa e faz outra, o que é mais grave do que não ter a API. Precisa dizer, no
mínimo: que os dados vão para um servidor, qual empresa o opera (Google), em
que país ficam, por quanto tempo, e como pedir cópia ou exclusão.

### 2. A auditoria e o histórico de consentimento dependem do aplicativo

Os dois são gravados pelo app. As regras garantem que, uma vez gravados,
ninguém altera nem apaga. Mas **não há como obrigar o app a gravar**. Alguém
com um APK modificado poderia alterar o perfil, ou trocar um consentimento,
sem deixar rastro.

Isso não é descuido de implementação: é o limite de uma arquitetura sem
servidor próprio. Registro realmente confiável precisa ser feito no servidor,
na mesma transação da escrita, ou seja, Cloud Functions e plano Blaze.

Enquanto isso não existir, o `consentimentos` (decisão atual) continua sendo
validado pelo servidor e é o que vale na prática: sem ele concedido, o dado
sensível não entra. O histórico é prova complementar, não a única barreira.

### 3. Os registros de acesso do art. 15 estão incompletos

O Marco Civil fala em registro de acesso: data, hora e **endereço IP**. O
Firebase Auth guarda o último acesso, mas não o IP, e o plano gratuito não dá
acesso aos logs de conexão. Hoje o projeto registra ação e horário, não origem.

Para cumprir por inteiro: Cloud Functions gravando o IP da requisição, ou
exportação do Cloud Logging. Os dois pedem o plano Blaze.

### 4. Limite de requisições é parcial

As regras impõem 3 segundos entre atualizações de perfil, e isso não dá para
burlar. Mas não há limite por minuto, por IP, nem na criação de registros de
auditoria. Quem automatizasse um cliente poderia gerar volume e consumir a cota.

Atenua bastante: ativar o **App Check**, que funciona no plano gratuito e
recusa requisições que não venham do app legítimo. Resolver de verdade exige
servidor próprio.

### 5. Menores de idade

O app aceita idade a partir de 10 anos. A LGPD, no art. 14, trata dados de
crianças e adolescentes com regra própria, e exige consentimento de um dos pais
para menores de 12. O projeto **não implementa isso**. A equipe precisa decidir:
estabelecer idade mínima, ou criar o fluxo de consentimento parental.

### 6. Documentos que o código não substitui

- Política de privacidade e termos de uso.
- Encarregado pelo tratamento de dados, o DPO (art. 41), com canal de contato.
- Procedimento de resposta a incidente (art. 48).
- Relatório de impacto, recomendável por haver dado sensível e público vulnerável.
- Registro das operações de tratamento (art. 37), na forma de documento.

### 7. Transferência internacional

Escolha a região do Firestore no momento de criar o banco, porque **não dá para
mudar depois**. `southamerica-east1` (São Paulo) mantém os dados no Brasil e
evita a discussão do capítulo V da LGPD, sobre transferência internacional.
Se escolher uma região fora do país, isso precisa constar na política de
privacidade e ter base legal.
