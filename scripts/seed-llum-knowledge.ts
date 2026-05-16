// Cria os 7 documentos da base de conhecimento Maria de uma vez só,
// autenticando como admin e postando em /api/knowledge.
// Cada POST dispara o auto-indexing (chunker + embeddings).
//
// Uso: npx tsx scripts/seed-llum-knowledge.ts
//   ou: BASE_URL=https://llum-crm-ia.vercel.app npx tsx scripts/seed-llum-knowledge.ts

import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const BASE_URL = process.env.BASE_URL || 'https://llum-crm-ia.vercel.app'
const ADMIN_EMAIL = process.env.CRM_ADMIN_EMAIL!
const ADMIN_PASSWORD = process.env.CRM_ADMIN_PASSWORD!

type DocPayload = {
  title: string
  category: string
  sourceType: 'faq' | 'policy' | 'menu' | 'pricing' | 'operations' | 'custom'
  content: string
  summary?: string
  tags: string[]
  status: 'draft' | 'published' | 'archived'
}

const docs: DocPayload[] = [
  {
    title: 'Informações Gerais',
    category: 'informacoes',
    sourceType: 'faq',
    summary: 'Endereço, telefone, dias e horários de funcionamento, estacionamento, pagamento.',
    tags: ['endereço', 'telefone', 'horário', 'funcionamento', 'estacionamento', 'pagamento'],
    status: 'published',
    content: `A LLUM Pizzaria fica na Rua Professora Maria de Assumpção, 101 — Hauer, Curitiba (PR), CEP 81630-040, perto do Shopping Cidade. Telefone de contato: (41) 98805-8553.

Funcionamos de domingo a quinta e aos sábados, das 18h30 às 23h30. NÃO abrimos às sextas-feiras.

O estacionamento é gratuito e já está incluso no valor da experiência.

Não trabalhamos com bebidas alcoólicas.

Formas de pagamento aceitas: crédito, débito, pix e dinheiro. Não aceitamos VA, VR, Alelo, vale-alimentação nem vale-refeição.

Perguntas frequentes:
- Abre sexta? Não abrimos às sextas-feiras.
- Tem estacionamento? Sim, gratuito e já incluso.
- Tem bebida alcoólica? Não trabalhamos com álcool.
- Aceita VR/VA/Alelo? Não aceitamos vouchers de alimentação ou refeição. Trabalhamos com crédito, débito, pix e dinheiro.
- Qual o endereço? Rua Professora Maria de Assumpção, 101, Hauer, Curitiba — perto do Shopping Cidade.`,
  },
  {
    title: 'Valores e Taxa de Reserva',
    category: 'valores',
    sourceType: 'pricing',
    summary: 'Preços de buffet por dia, taxa de R$5 com abatimento, política de cancelamento.',
    tags: ['preço', 'valor', 'buffet', 'taxa', 'reserva', 'abatimento', 'cancelamento'],
    status: 'published',
    content: `Os valores do buffet variam pelo dia da semana:
- Adulto de domingo a quinta: R$89,90
- Adulto aos sábados: R$99,90
- Criança de 6 a 10 anos: R$49,90 (qualquer dia)
- Criança até 5 anos: não paga buffet

A reserva tem uma taxa antecipada de R$5,00 por pessoa que NÃO é um valor extra — ela funciona como garantia da mesa e é abatida individualmente na chegada para adultos e crianças de 6 a 10 anos.

Com o abatimento, na chegada paga:
- Adulto domingo a quinta: R$84,90
- Adulto sábado: R$94,90
- Criança 6 a 10 anos: R$44,90

Para crianças até 5 anos, a taxa de R$5 garante o assento reservado mas não é abatida (já que a criança não paga buffet).

Cálculo da taxa: R$5 × quantidade total de lugares. Exemplos: 2 pessoas = R$10, 5 pessoas = R$25, 10 pessoas = R$50.

Política de cancelamento:
- Reservas sem pagamento não são confirmadas.
- Em caso de não comparecimento, a taxa não é reembolsável.
- Cancelamentos com pelo menos 24h de antecedência podem ser estornados.
- Convidados faltantes na reserva podem gerar perda da taxa correspondente e cobrança dos assentos não utilizados.

Perguntas frequentes:
- A taxa é cobrada além do buffet? Não, é abatida na chegada.
- Como cancelar e ter estorno? Avisar com pelo menos 24h de antecedência.
- Menor de 5 anos paga? Não paga buffet, mas a taxa de R$5 do assento reservado é cobrada.
- Tem desconto pra grupo? Não trabalhamos com desconto progressivo.`,
  },
  {
    title: 'Experiência e Cardápio',
    category: 'experiencia',
    sourceType: 'menu',
    summary: 'Modelo all inclusive, buffet, bebidas, atrações infantis, sala de jogos, personagens.',
    tags: ['buffet', 'pizza', 'bebida', 'sorvete', 'sala de jogos', 'brinquedos', 'infantil', 'all inclusive'],
    status: 'published',
    content: `A LLUM opera no modelo all inclusive: comida, bebida e atrações inclusas em um único valor.

Buffet:
- Pizzas salgadas e doces;
- Buffet quente com lasanhas, escondidinho da Madalena, estrogonoffe, fettuccine, arroz e batata palha;
- Saladas e frutas.

Buffet infantil:
- Salgados: coxinha, nuggets, bolinha de queijo;
- Acompanhamentos: mini churros, batata frita, polentinha, maionese especial.

Bebidas inclusas: refrigerante KS, água, suco e sorvete soft. Sem álcool.

Atrações infantis inclusas: brinquedos infláveis, espaço kids, sala game, LLuMzinhO e interação no palco.

Sala de jogos por idade:
- Playstation: acima de 6 anos;
- Meta Quest (realidade virtual): acima de 6 anos;
- Simulador Fórmula 1: acima de 11 anos e adultos.

Temos monitoras na área infantil, mas a responsabilidade pelas crianças continua sendo dos pais. Recomendamos roupa confortável para a criança aproveitar melhor.

Personagens:
- Patrulha Canina: aos domingos e terças;
- LLuMzinhO: presente todos os dias.

Momento do parabéns acontece em média às 20h30, com o LLuMzinhO no telão e interação com as crianças.

Perguntas frequentes:
- Tem bebida inclusa? Sim — refrigerante, água, suco e sorvete.
- Tem brinquedos? Sim — infláveis, espaço kids, sala game.
- Tem personagens? Patrulha Canina aos domingos e terças, LLuMzinhO todos os dias.
- Pode usar Playstation? Sim, acima de 6 anos.
- Tem simulador? Sim, F1 — para crianças acima de 11 anos e adultos.`,
  },
  {
    title: 'Aniversários e Celebrações',
    category: 'aniversarios',
    sourceType: 'faq',
    summary: 'Benefício do aniversariante, condições, bolo fake, decoração, momento parabéns.',
    tags: ['aniversário', 'niver', 'parabéns', 'comemorar', 'bolo', 'decoração'],
    status: 'published',
    content: `A LLUM é referência em aniversários e celebrações familiares.

Benefício do aniversariante: ganha o buffet, desde que:
- Esteja na semana do aniversário (válido inclusive no próprio dia);
- Apresente documento com foto comprovando a data;
- Esteja acompanhado de pelo menos 3 adultos pagantes no valor normal.

Não é obrigatório ter reserva para usar o benefício, mas sem reserva o atendimento fica sujeito à disponibilidade da casa.

É permitido levar bolo próprio e pequenas decorações.

Bolo fake: oferecemos locação por R$10, vela inclusa, para a foto do parabéns ficar bonita.

Decorações maiores precisam ser combinadas previamente com a gerência.

Todos os aniversariantes têm o momento do parabéns no salão por volta das 20h30, com o LLuMzinhO no telão e interação infantil.

Perguntas frequentes:
- Aniversariante paga? Vindo na semana do aniversário com 3 adultos pagantes, ganha o buffet.
- Precisa reservar pra aniversário? Não é obrigatório, mas sem reserva depende de disponibilidade.
- Posso levar bolo? Pode sim. Também temos opção de bolo fake por R$10 com vela inclusa.
- Posso decorar a mesa? Pequenas decorações sim. Para decoração maior, precisamos combinar antes com a gerência.
- Que horas é o parabéns? Em média às 20h30, com o LLuMzinhO no telão.`,
  },
  {
    title: 'Públicos Especiais e Restrições',
    category: 'publicos-especiais',
    sourceType: 'policy',
    summary: 'Bariátricos com meia entrada, prioridade PCD/autistas, restrições alimentares.',
    tags: ['bariátrico', 'autista', 'PCD', 'restrição alimentar', 'glúten', 'sem porco', 'adventista'],
    status: 'published',
    content: `Bariátricos: trabalhamos com meia entrada para bariátricos no valor de R$49,90 em qualquer dia. É obrigatório apresentar a carteirinha bariátrica na chegada — sem o documento, o desconto não é aplicado.

PCD e pessoas autistas: oferecemos prioridade de atendimento para a pessoa autista mais 1 acompanhante, sujeita à disponibilidade da casa no momento.

Restrições alimentares:
- Sem glúten: atualmente não temos opção específica sem glúten no buffet;
- Sem carne suína: temos diversos sabores de pizza e itens sem carne de porco;
- Outras restrições médicas: pedimos que sejam informadas previamente, com a maior antecedência possível, para conseguirmos orientar melhor.

Perguntas frequentes:
- Bariátrico tem desconto? Sim, meia entrada (R$49,90), mediante apresentação da carteirinha bariátrica.
- Tem opção sem glúten? Atualmente não temos opção específica sem glúten.
- Tem opção sem carne de porco? Sim, temos vários sabores e itens sem carne suína.
- Sou autista, tem prioridade? Sim, prioridade para a pessoa autista mais um acompanhante, sujeita à disponibilidade.
- Tenho restrição alimentar séria, e agora? Nos avise previamente pra conseguirmos orientar — vale também trazer o que precisar conforme orientação médica.`,
  },
  {
    title: 'Políticas Operacionais',
    category: 'politicas',
    sourceType: 'policy',
    summary: 'All inclusive, regras de mesas, horários da reserva, sem reserva e fila de espera.',
    tags: ['regras', 'mesas', 'horário', 'sem reserva', 'fila', 'espera', 'consumo'],
    status: 'published',
    content: `A LLUM trabalha exclusivamente no modelo all inclusive. Não cobramos consumo proporcional — todo cliente paga buffet completo, mesmo consumindo pouco.

Não é permitido:
- Pagar proporcional ou consumir pouco pagando menos;
- Juntar mesas (compromete a logística das reservas);
- Sair levando insumos ou comida do buffet.

Orientação geral: evitar desperdício no prato.

Horários importantes para reservas:
- O titular da reserva precisa chegar até 19h00 (tolerância de 15 minutos);
- Demais convidados podem chegar até 19h45;
- Após esses horários, os lugares podem ser liberados para a fila de espera e os assentos reservados não utilizados podem ser cobrados.

Sem reserva: a entrada é permitida, porém sujeita à disponibilidade e possível fila de espera. Não há garantia de mesa grande, mesas próximas ou acomodação conjunta para o grupo todo.

Existe lista de espera apenas enquanto houver capacidade operacional da casa.

Perguntas frequentes:
- Sem reserva consigo entrar? Sim, mas sujeito à disponibilidade e à fila de espera.
- Pode juntar mesas? Não, porque compromete outras reservas.
- Posso pagar menos comendo pouco? Não, trabalhamos no modelo all inclusive.
- Posso levar comida pra casa? Não, o consumo é exclusivo no salão.
- Que horas precisa chegar? Titular da reserva até 19h00 (tolerância 15 min); demais convidados até 19h45.
- Tem fila? Pode haver, dependendo da lotação.`,
  },
  {
    title: 'Padrões de Procura e Como Reservar',
    category: 'reservas',
    sourceType: 'operations',
    summary: 'Reservas pelo app oficial, padrões de procura por dia da semana, recuperação de cliente sem disponibilidade.',
    tags: ['reserva', 'app', 'link', 'procura', 'lotação', 'sábado', 'quarta', 'alternativa', 'agendar'],
    status: 'published',
    content: `As reservas da LLUM são feitas exclusivamente pelo app oficial: https://llum-reservas.vercel.app/reserva. O atendimento por WhatsApp NÃO realiza reservas manualmente — sempre direcionamos o cliente para o app, onde a disponibilidade em tempo real é consultada.

Padrões típicos de procura:
- Sábados são os dias de maior procura. Recomendamos reservar com bastante antecedência;
- Domingos e datas próximas a feriados também costumam encher rápido;
- Quartas-feiras e dias de semana em geral costumam ter mais disponibilidade e ambiente mais tranquilo — opção excelente para famílias com crianças pequenas que querem aproveitar os brinquedos e a sala game sem disputa.

Se o cliente diz que tentou reservar pelo app e não conseguiu para uma data, é provável que a data esteja com alta procura ou indisponível. A melhor recuperação é sugerir uma data alternativa em dia de semana, apresentando os benefícios (mais conforto, menos espera, mais espaço pras crianças aproveitarem). Nunca prometer fazer a reserva manualmente pelo WhatsApp — o caminho é sempre o app.

Por que recomendamos reservar:
- Garante a mesa e evita espera;
- Para grupos, garante acomodação conjunta;
- Aniversariantes na semana do aniversário com 3 adultos pagantes ganham o buffet (mas precisam estar na mesa reservada).

Perguntas frequentes:
- Precisa reservar? Não é obrigatório, mas recomendamos bastante porque as datas costumam lotar rapidamente.
- Como reservo? Pelo app oficial: https://llum-reservas.vercel.app/reserva
- Tentei reservar pra sábado e não consegui, o que faço? Provavelmente está com alta procura. Tente uma data durante a semana, como quarta-feira — costuma ter mais disponibilidade e ambiente mais tranquilo.
- Vocês reservam por WhatsApp? Não, todas as reservas são feitas pelo app oficial.
- A taxa garante mesa pro grupo todo? Sim, a reserva mantém os lugares juntos.`,
  },
]

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('CRM_ADMIN_EMAIL e CRM_ADMIN_PASSWORD precisam estar no .env.local')
  }

  console.log(`logging in at ${BASE_URL}/api/auth/login ...`)
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!loginResp.ok) {
    throw new Error(`login failed: ${loginResp.status} ${await loginResp.text()}`)
  }
  const setCookie = loginResp.headers.get('set-cookie')
  if (!setCookie) throw new Error('login retornou sem set-cookie')
  const cookieHeader = setCookie.split(';')[0]
  console.log('login ok, cookie obtained')

  for (const doc of docs) {
    process.stdout.write(`POST ${doc.title} ... `)
    const r = await fetch(`${BASE_URL}/api/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify(doc),
    })
    if (!r.ok) {
      console.log(`FAIL ${r.status} ${await r.text()}`)
      continue
    }
    const data = (await r.json()) as { document?: { id?: string }; indexing?: { chunks?: number } }
    console.log(`ok id=${data.document?.id?.slice(0, 8)} chunks=${data.indexing?.chunks ?? '?'}`)
  }

  console.log()
  console.log('--- DONE ---')
  console.log('Veja em ' + BASE_URL + '/ai/knowledge')
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
