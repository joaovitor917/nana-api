# Revisão do documento do banco de dados

Lista do que foi **mudado, acrescentado ou deixado de fora** em relação ao
documento "Banco de Dados – Nanã", versão 0.2, com o motivo de cada decisão.

Serve para a equipe revisar e, se concordar, atualizar o documento para a
versão 0.3. Nada aqui foi decidido escondido.

---

## 1. `senha_hash` foi removido

**No documento:** a entidade Mães tem o campo `senha_hash`, descrito como
"senha armazenada em formato protegido".

**O que foi feito:** o campo não existe no banco.

**Por quê:** quem guarda e confere a senha é o Firebase Authentication, num
sistema separado ao qual o aplicativo não tem acesso de leitura. Guardar o hash
também no Firestore não acrescenta nada e cria um risco grande: hash de senha é
alvo de ataque de força bruta, e bastaria uma falha de regra para expor as
senhas de todas as mães de uma vez.

A seção 9 do documento já pede "algoritmos seguros de hash". O Firebase Auth usa
scrypt, que é mais forte do que o que o grupo conseguiria montar à mão.

**Ação sugerida:** retirar `senha_hash` da documentação e anotar que a
autenticação fica a cargo do Firebase Authentication.

---

## 2. `id_mae` e os outros identificadores viraram caminho

**No documento:** cada entidade tem `id_mae`, `id_perfil`, `id_registro` e por
aí.

**O que foi feito:** o identificador do documento da mãe é o UID do Firebase
Auth, e as demais entidades são subcoleções dentro dela.

**Por quê:** além de simplificar, é o que torna a segurança sólida. Em
`maes/{uid}/diario_cuidado/...`, não existe como pedir o registro de outra
pessoa: o endereço do dado já diz de quem ele é. Com `id_mae` guardado dentro
do documento, toda consulta precisaria conferir esse campo, e basta esquecer
uma vez para vazar.

Detalhe de `diario_cuidado`: o id do documento é a data (`2026-11-22`). Isso
garante um registro por dia sem precisar consultar o banco antes de gravar.

---

## 3. O e-mail não é guardado no Firestore

**No documento:** campo `email` na entidade Mães, com a Regra 1 proibindo
duplicatas.

**O que foi feito:** o e-mail fica só no Firebase Authentication.

**Por quê:** o Firebase Auth já garante que não existam dois cadastros com o
mesmo e-mail, que é exatamente a Regra 1 — e garante melhor do que uma
validação nossa. Copiar o e-mail para o Firestore criaria dois lugares para
atualizar quando a mãe trocar de endereço, e dois para apagar quando ela pedir
exclusão. Dado pessoal duplicado é dado pessoal esquecido em algum canto.

---

## 4. Idade ou data de nascimento: falta decidir

**No documento:** `data_nascimento` na entidade Mães, opcional.

**No aplicativo:** o cadastro pergunta a **idade**, não a data.

**O que foi feito:** os dois campos são aceitos, ambos opcionais, até a equipe
decidir.

**Recomendação:** ficar só com a idade. A data de nascimento identifica a
pessoa com muito mais precisão, e o documento "Jornada do Usuário" já
perguntava se uma faixa etária não bastaria. Pelo princípio da necessidade da
LGPD (art. 6º, III), não se coleta o dado mais preciso quando o menos preciso
resolve.

**Ação sugerida:** escolher um dos dois e remover o outro das regras.

---

## 5. Mulheres indígenas: documento e aplicativo divergem

**No documento:** o Nanã atende "mulheres negras, pardas e indígenas"
(seções 2 e 3).

**No aplicativo:** a autodeclaração oferece apenas Preta, Parda e Prefiro não
dizer. Indígena foi removida a pedido.

**O que foi feito:** as regras aceitam só `PRETA`, `PARDA` e
`PREFIRO_NAO_DIZER`, seguindo o aplicativo.

**Por que isso importa:** não é detalhe de implementação. O documento promete
um público que o aplicativo não acolhe — uma mulher indígena que baixasse o app
não se encontraria no cadastro. Ou o documento muda, ou o app muda.

Para incluir, basta acrescentar `'INDIGENA'` em `autodeclaracoesValidas()`, nas
regras, e a opção correspondente no cadastro do app.

**Ação sugerida:** a equipe decide e alinha os dois.

---

## 6. `preferencias` aparecia duas vezes

**No documento:** o perfil de acolhimento tem um campo `preferencias` de texto
livre ("Conteúdos sobre cicatrização"), e existe também a entidade
"Preferências de conteúdo", com categoria e ativo.

**O que foi feito:** ficou só a subcoleção `preferencias_conteudo`.

**Por quê:** guardar a mesma informação nos dois lugares leva a respostas
diferentes dependendo de onde o app lê. A subcoleção é melhor porque permite
ligar e desligar cada categoria, que é a Regra 4 do próprio documento. Texto
livre não dá para filtrar conteúdo.

---

## 7. Sintomas são dado sensível e passaram a exigir consentimento

**No documento:** a seção 9 diz que informações de saúde devem ter "acesso
restrito".

**O que foi feito:** além do acesso restrito, o campo `sintomas` só pode ser
gravado se existir um consentimento específico registrado, com a finalidade
`dados_de_saude`.

**Por quê:** acesso restrito não basta. A LGPD classifica dado referente à
saúde como **sensível** (art. 5º, II) e exige, no art. 11, I, consentimento
específico e destacado para tratá-lo. É a mesma exigência que já vale para a
origem racial.

Na prática: a mãe pode registrar como se sente sem consentir nada. Para
escrever sintomas, precisa ter aceitado antes, numa tela que ainda não existe.

**Ação sugerida:** acrescentar isso à seção 9 do documento e desenhar a tela de
consentimento.

---

## 8. Consentimento e auditoria foram acrescentados

**No documento:** não existem.

**O que foi feito:** três subcoleções novas — `consentimentos`,
`consentimentos_historico` e `auditoria`.

**Por quê:** sem elas, não há como cumprir o que a própria seção 9 promete.

- A LGPD exige que o consentimento seja **comprovável** (art. 8º, §1º) e
  revogável com a mesma facilidade com que foi dado (art. 8º, §5º).
- O Marco Civil (art. 15) exige guardar registros de acesso por 6 meses.
- O Decreto 8.771/2016 (art. 13) exige inventário de quem acessou o quê.

A auditoria guarda só o **nome** dos campos tocados, nunca o valor: um log de
dados pessoais é uma segunda cópia dos dados pessoais, com o agravante de ser
uma cópia que ninguém lembra de proteger.

---

## 9. Obrigatoriedade: as regras são mais frouxas que o documento

**No documento:** `nome` e `status` são obrigatórios na entidade Mães;
vários outros campos também.

**O que foi feito:** só são exigidos os campos sem os quais o app quebra:
`status` e os carimbos de data em Mães, e `fasePosParto` no perfil.

**Por quê:** o documento "Jornada do Usuário" diz que a obrigatoriedade de cada
campo "ainda deve ser validada" com as mães, e o aplicativo hoje deixa o nome
em branco por escolha. Se a regra exigisse o nome, o cadastro do app passaria a
falhar.

**Ação sugerida:** decidir a obrigatoriedade com as mães, como a Jornada previa,
e então apertar as regras. O lugar é a função `maeValida()`.

---

## 10. Backups periódicos não cabem no plano gratuito

**No documento:** seção 9 pede "backups periódicos".

**Situação:** o backup automático do Firestore é recurso pago, do plano Blaze.
No plano Spark não existe.

**Alternativas sem custo:** rodar o script `admin/exportar-dados.js` por mãe não
serve como backup do banco. O que dá para fazer de graça é exportar a coleção
inteira com o `gcloud` de tempos em tempos, manualmente.

**Ação sugerida:** decidir se o backup entra agora, com upgrade de plano, ou se
o projeto aceita o risco até depois da entrega, registrando isso no documento.

---

## 11. O que ficou de fora por enquanto

Consultas e Conteúdos estão no documento, mas ainda não
têm tela no aplicativo. (Conversas e Mensagens já foram implementadas como
`chats`: ver MODELO-DE-DADOS.md.) As regras **negam** essas coleções.

Isso é proposital: coleção liberada antes de existir a tela é a forma mais
comum de deixar um banco aberto sem perceber. Quando as telas forem feitas, as
regras entram junto.

Ver o fim de `MODELO-DE-DADOS.md` para o que vai exigir cuidado em cada uma.
