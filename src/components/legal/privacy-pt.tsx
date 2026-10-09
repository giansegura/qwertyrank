import { Link } from "@/i18n/navigation";
import { CONTROLLER, PRIVACY_EMAIL } from "@/lib/site";

const MAIL = `mailto:${PRIVACY_EMAIL}`;

/** Política de privacidad en portugués (spec 5a §4.2). Borrador para la beta: pendiente de revisión legal. */
export function PrivacyPt() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <p>Última atualização: 8 de outubro de 2026.</p>
      <p>
        O QwertyRank é um site para medir e comparar sua velocidade de digitação, e está em beta. Aqui explicamos quais
        dados tratamos, para quê e quais são os seus direitos.
      </p>

      <h2>Quem é o responsável</h2>
      <p>
        {CONTROLLER} (Espanha). Para qualquer questão sobre seus dados: <a href={MAIL}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>Quais dados tratamos</h2>
      <ul>
        <li>
          <strong>Conta:</strong> seu email, o nick que você escolher e, se informar, seu país. Se você entrar com o
          Google, o identificador da sua conta Google e o email que ele compartilha conosco.
        </li>
        <li>
          <strong>Partidas:</strong> palavras por minuto, precisão, idioma, tipo de teclado, o horário da partida e suas
          teclas com o tempo de cada uma (qual tecla e quando), que usamos para validar a partida e detectar trapaças.
        </li>
        <li>
          <strong>Navegador:</strong> um cookie com um identificador anônimo, para poder salvar na sua conta uma partida
          que você jogou sem ter entrado.
        </li>
        <li>
          <strong>Endereço IP:</strong> nunca o guardamos como está, apenas um resumo (hash) que muda a cada dia, para
          limitar abusos.
        </li>
        <li>
          <strong>Contas banidas:</strong> se uma conta for banida por trapaça, guardamos uma impressão digital (hash) do seu
          email e da sua conta Google para que ela não possa se registrar de novo.
        </li>
      </ul>

      <h2>Para quê e com qual base legal</h2>
      <ul>
        <li>
          Prestar o serviço (sua conta, seu perfil público, sua posição no ranking e a página de cada partida válida,
          que qualquer pessoa com o link pode ver): execução do contrato que você aceita ao criar a conta.
        </li>
        <li>
          Validar as partidas e prevenir trapaças e abusos (verificar as teclas, limitar partidas, verificar recordes,
          sancionar contas e impedir que as banidas se registrem de novo): nosso interesse legítimo em um ranking justo e
          um serviço seguro.
        </li>
      </ul>

      <h2>Por quanto tempo</h2>
      <ul>
        <li>
          Teclas: 30 dias. As da sua melhor marca em cada ranking são guardadas enquanto ela continuar sendo a melhor,
          para poder revisá-la.
        </li>
        <li>
          Antes de apagar as teclas guardamos um extrato do seu ritmo (tempos entre teclas, sem texto, sem teclas e sem
          identificadores, com a velocidade e a precisão arredondadas), ou seja, pseudonimizado, para melhorar a detecção de
          trapaças. É guardado sem prazo com base no nosso interesse legítimo em calibrar o antitrapaça.
        </li>
        <li>
          Partidas: após 30 dias, o identificador anônimo e o resumo do IP de todas as partidas são apagados, com conta ou
          sem ela. Das partidas sem conta ficam apenas os números, para estatísticas; as da sua conta continuam nela até você
          apagá-la.
        </li>
        <li>
          Sua conta: até você apagá-la. Ao apagá-la, eliminamos seu email, nick, país, sessões, passkeys, suas marcas e
          as teclas das suas partidas, e você sai dos rankings; suas partidas ficam anônimas.
        </li>
        <li>Impressões de contas banidas: sem prazo, enquanto forem necessárias para prevenir fraudes.</li>
      </ul>

      <h2>Com quem compartilhamos</h2>
      <p>
        Não vendemos seus dados nem os usamos para publicidade. Estes fornecedores os tratam por nossa conta: Vercel
        (hospedagem e análise sem cookies), Neon (banco de dados), Upstash (dados temporários e rankings), Resend (envio
        de emails), Cloudflare (Turnstile, a verificação anti-bots), Sentry (registro de erros do servidor) e Google,
        apenas se você entrar com o Google. Alguns estão fora da União Europeia, sobretudo nos Estados Unidos: essas
        transferências usam as garantias de cada fornecedor (cláusulas contratuais padrão ou o Quadro de Privacidade de
        Dados UE-EUA).
      </p>

      <h2>Cookies</h2>
      <p>
        Usamos apenas cookies estritamente necessários para o site funcionar: o da sua sessão, o identificador anônimo,
        o que lembra que você passou pela verificação anti-bots e o do seu idioma. Não usamos cookies de publicidade nem
        de análise, por isso não pedimos consentimento. A análise da Vercel não usa cookies.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode acessar, corrigir e apagar seus dados, se opor ao tratamento, limitá-lo e pedir uma cópia. Para apagar
        sua conta e todos os seus dados, use &quot;Excluir minha conta&quot; na página{" "}
        <Link href="/settings">Sua conta</Link>. Para o resto, escreva para <a href={MAIL}>{PRIVACY_EMAIL}</a>. Se
        achar que não tratamos bem seus dados, pode reclamar à Agência Espanhola de Proteção de Dados (
        <a href="https://www.aepd.es">aepd.es</a>) ou à autoridade do seu país (no Brasil, a ANPD).
      </p>

      <h2>Idade mínima</h2>
      <p>Você precisa ter pelo menos 14 anos para criar uma conta.</p>

      <h2>Mudanças</h2>
      <p>Se mudarmos esta política, atualizaremos a data acima e, se a mudança for importante, avisaremos você.</p>
    </>
  );
}
