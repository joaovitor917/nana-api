# API do Nanã

Banco de dados do aplicativo Nanã, no Firebase: cadastro das mães, perfil de
acolhimento, diário de cuidado e preferências de conteúdo, com as proteções
exigidas pela LGPD, pelo Marco Civil, pelo CDC e pelo Decreto 8.771/2016.

Feito para o **plano gratuito (Spark)**. Não usa Cloud Functions, que exigem
cartão de crédito.

## Como isso funciona

Sem Cloud Functions, a API é o **Firestore com Security Rules**. As regras
rodam nos servidores do Google, não no celular: o app não consegue contorná-las
nem com o APK modificado. Toda a autorização e toda a validação obrigatória
ficam em `firestore.rules`.

Implementa o documento **"Banco de Dados – Nanã", versão 0.2**, traduzido do
modelo relacional para o jeito do Firestore.

Três leituras, em ordem de importância:

1. **`docs/REVISAO-DO-DOCUMENTO.md`** — o que foi mudado em relação ao documento
   do grupo, e por quê. Tem decisões que a equipe precisa tomar.
2. `docs/MODELO-DE-DADOS.md` — a estrutura completa: coleções, campos e a ordem
   das operações.
3. `docs/CONFORMIDADE.md` — o que isso cumpre das leis e o que não cumpre.

## Arquivos

```
nana-api/
├── firestore.rules          o coração: autorização e validação
├── storage.rules            fechado, o app não guarda arquivo
├── firestore.indexes.json   índices, com busca desligada nos campos pessoais
├── firebase.json
├── admin/                   scripts dos direitos do titular (LGPD art. 18)
│   ├── exportar-dados.js    acesso e portabilidade
│   ├── excluir-conta.js     eliminação
│   └── expurgar-logs.js     descarte da auditoria vencida
├── testes/                  provam que as regras funcionam
└── docs/
    ├── REVISAO-DO-DOCUMENTO.md  divergências em relação ao PDF do grupo
    ├── MODELO-DE-DADOS.md       coleções, campos e ordem das operações
    ├── CONFORMIDADE.md          mapa das leis e as lacunas
    └── OWASP.md                 riscos cobertos e os que não estão
```

## Instalar

### 1. Criar o projeto no Firebase

1. Entre em console.firebase.google.com e clique em **Adicionar projeto**.
2. **Desative o Google Analytics.** Ele coleta dados que o Nanã não precisa, e
   cada dado a mais é uma obrigação a mais na LGPD.

### 2. Criar o banco

Em **Firestore Database › Criar banco de dados**:

- Modo: **produção** (começa negando tudo, que é o certo).
- Região: **southamerica-east1 (São Paulo)**.

> A região **não pode ser alterada depois**. São Paulo mantém os dados no
> Brasil e evita a discussão de transferência internacional do capítulo V da
> LGPD.

### 3. Ligar o login

Em **Authentication › Sign-in method**, ative **E-mail/senha**.

Depois, em **Authentication › Settings**:

- ative **Proteção contra enumeração de e-mail**, que impede descobrir quem tem
  conta no app testando endereços;
- em **Password policy**, exija no mínimo 8 caracteres, com letra e número.

### 4. Publicar as regras

Na sua máquina, dentro da pasta `nana-api`:

```
npm install -g firebase-tools
firebase login
firebase use --add            # escolha o projeto criado no passo 1
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 5. Conferir se as regras funcionam

Este passo não é opcional. Regra de segurança errada não dá erro: ela
simplesmente deixa passar o que não devia, e você descobre tarde.

**No Windows, o jeito fácil:** dê dois cliques em **`TESTAR-REGRAS.bat`**, na
pasta do projeto. Ele confere o que falta instalar, acha o Java do Android
Studio sozinho, instala as dependências e roda os 33 testes.

Pelo terminal, em qualquer sistema:

```
cd testes
npm install
npm test
```

Precisa de **Node.js** (nodejs.org, versão LTS) e de **Java**, que o emulador
usa. O Android Studio já traz um Java, em
`C:\Program Files\Android\Android Studio\jbr`.

## Scripts administrativos

Atendem aos pedidos das usuárias previstos no art. 18 da LGPD. Rodam na sua
máquina, com o Admin SDK, e **ignoram as regras de segurança** — quem os executa
enxerga os dados de qualquer pessoa.

### Preparar

1. No console: **Configurações do projeto › Contas de serviço › Gerar nova
   chave privada**. Baixa um arquivo JSON.
2. Guarde esse arquivo **fora da pasta do projeto**. Ele dá acesso total ao
   banco. Se vazar no GitHub, qualquer pessoa lê e apaga tudo.
3. Aponte a variável de ambiente para ele:

```
# Windows (PowerShell)
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\chaves\nana-admin.json"

# Linux ou Mac
export GOOGLE_APPLICATION_CREDENTIALS=/caminho/nana-admin.json
```

4. Instale as dependências:

```
cd admin
npm install
```

### Usar

```
node exportar-dados.js <uid>     # cópia de tudo, em JSON (art. 18, II e V)
node excluir-conta.js <uid>      # apaga conta e dados (art. 18, VI)
node expurgar-logs.js            # descarta auditoria com mais de 6 meses
node expurgar-logs.js 183 teste  # mostra o que apagaria, sem apagar
```

O `excluir-conta.js` pede confirmação por escrito e gera uma exportação antes
de apagar, porque depois não há de onde tirar os dados.

O `expurgar-logs.js` convém rodar uma vez por mês. Guardar registro além do
necessário é risco, não cuidado: é mais dado para vazar.

## Antes de colocar no ar

- [ ] Ativar o **App Check** com Play Integrity (ver `docs/OWASP.md`). É a
      medida de melhor retorno disponível no plano gratuito.
- [ ] **Reescrever a tela de privacidade do app.** Hoje ela diz que os dados
      ficam só no aparelho, e com esta API isso deixa de ser verdade.
- [ ] Escrever a política de privacidade e os termos de uso.
- [ ] Indicar o encarregado de dados, o DPO, com canal de contato (art. 41).
- [ ] Definir o procedimento de resposta a incidente (art. 48).
- [ ] Decidir o que fazer com usuárias menores de idade (art. 14).
- [ ] Configurar alerta de orçamento no Google Cloud.
- [ ] Rodar os testes das regras, e rodar de novo a cada alteração.

Os quatro primeiros itens não são código, e nenhum deles é dispensável.

## Aviso

Não sou advogado. O que está aqui são medidas técnicas que **apoiam** a
conformidade; elas não a garantem sozinhas. Antes de publicar um app que trata
dado de saúde e origem racial de um público vulnerável, consulte alguém da
área jurídica. `docs/CONFORMIDADE.md` lista o que falta, item por item.
