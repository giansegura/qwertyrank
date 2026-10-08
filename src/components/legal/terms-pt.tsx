import { Link } from "@/i18n/navigation";
import { FEEDBACK_EMAIL, PRIVACY_EMAIL } from "@/lib/site";

/** Términos de uso en portugués (spec 5a §4.3). Borrador para la beta: pendiente de revisión legal. */
export function TermsPt() {
  return (
    <>
      <h1>Termos de uso</h1>
      <p>Última atualização: 8 de outubro de 2026.</p>
      <p>
        Ao usar o QwertyRank, você aceita estes termos. Se criar uma conta, também aceita a{" "}
        <Link href="/privacy">Política de privacidade</Link>.
      </p>

      <h2>O serviço</h2>
      <p>
        O QwertyRank é um teste de velocidade de digitação com rankings, gratuito e em beta. Nós o oferecemos &quot;como
        está&quot;: pode ter erros, mudar ou ser interrompido, e durante a beta os rankings podem ser corrigidos ou
        reiniciados se houver falhas.
      </p>

      <h2>Sua conta</h2>
      <p>
        Você precisa ter pelo menos 14 anos. Você é responsável pelo que for feito com a sua conta. Seu nick não pode
        ser ofensivo nem se passar por outra pessoa.
      </p>

      <h2>Jogo limpo</h2>
      <p>
        É proibido usar bots, scripts, macros, texto colado ou injetado, ou qualquer outra forma de falsificar uma
        partida, assim como tentar contornar os limites ou a verificação de recordes.
      </p>

      <h2>Sanções</h2>
      <p>
        Se você descumprir estes termos, podemos, sem aviso prévio, ocultar suas marcas do ranking (só você as verá),
        mudar seu nick ou banir sua conta e impedir que você se registre de novo. Se achar que é um erro, escreva para
        nós.
      </p>

      <h2>Responsabilidade</h2>
      <p>
        Na medida permitida pela lei, não respondemos por danos decorrentes do uso do serviço ou da sua
        indisponibilidade. Nada disso limita os direitos que a lei reconhece a você como consumidor.
      </p>

      <h2>Lei aplicável</h2>
      <p>Estes termos são regidos pela lei espanhola.</p>

      <h2>Contato</h2>
      <p>
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Para comentários sobre a beta:{" "}
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>.
      </p>
    </>
  );
}
