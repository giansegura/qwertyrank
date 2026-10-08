import { Link } from "@/i18n/navigation";
import { FEEDBACK_EMAIL, PRIVACY_EMAIL } from "@/lib/site";

/** Términos de uso en español (spec 5a §4.3). Borrador para la beta: pendiente de revisión legal. */
export function TermsEs() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p>Última actualización: 8 de octubre de 2026.</p>
      <p>
        Al usar QwertyRank aceptas estos términos. Si creas una cuenta, aceptas también la{" "}
        <Link href="/privacy">Política de privacidad</Link>.
      </p>

      <h2>El servicio</h2>
      <p>
        QwertyRank es un test de velocidad de escritura con rankings, gratuito y en beta. Lo ofrecemos «tal cual»: puede
        tener errores, cambiar o interrumpirse, y durante la beta los rankings pueden corregirse o reiniciarse si hay
        fallos.
      </p>

      <h2>Tu cuenta</h2>
      <p>
        Necesitas tener al menos 14 años. Eres responsable de lo que se haga con tu cuenta. Tu nick no puede ser
        ofensivo ni hacerse pasar por otra persona.
      </p>

      <h2>Juego limpio</h2>
      <p>
        Está prohibido usar bots, scripts, macros, texto pegado o inyectado, o cualquier otra forma de falsear una
        partida, y también intentar saltarse los límites o la verificación de récords.
      </p>

      <h2>Sanciones</h2>
      <p>
        Si incumples estos términos podemos, sin aviso previo, ocultar tus marcas del ranking (solo las verás tú),
        cambiar tu nick o banear tu cuenta e impedir que vuelvas a registrarte. Si crees que es un error, escríbenos.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        En la medida en que lo permite la ley, no respondemos de los daños que pueda causar el uso del servicio o que
        no esté disponible. Nada de esto limita los derechos que la ley te reconoce como consumidor.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por la ley española.</p>

      <h2>Contacto</h2>
      <p>
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Para comentarios sobre la beta:{" "}
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>.
      </p>
    </>
  );
}
