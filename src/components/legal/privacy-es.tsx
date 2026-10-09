import { Link } from "@/i18n/navigation";
import { CONTROLLER, PRIVACY_EMAIL } from "@/lib/site";

const MAIL = `mailto:${PRIVACY_EMAIL}`;

/** Política de privacidad en español (spec 5a §4.2). Borrador para la beta: pendiente de revisión legal. */
export function PrivacyEs() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>Última actualización: 8 de octubre de 2026.</p>
      <p>
        QwertyRank es una web para medir y comparar tu velocidad de escritura, y está en beta. Aquí te contamos qué
        datos tratamos, para qué y qué derechos tienes.
      </p>

      <h2>Quién es el responsable</h2>
      <p>
        {CONTROLLER} (España). Para cualquier cuestión sobre tus datos: <a href={MAIL}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Cuenta:</strong> tu email, el nick que elijas y, si lo indicas, tu país. Si entras con Google, el
          identificador de tu cuenta de Google y el email que nos comparte.
        </li>
        <li>
          <strong>Partidas:</strong> palabras por minuto, precisión, idioma, tipo de teclado, la hora de la partida y
          tus pulsaciones con su tiempo (qué tecla y cuándo), que usamos para validar la partida y detectar trampas.
        </li>
        <li>
          <strong>Navegador:</strong> una cookie con un identificador anónimo, para poder guardar en tu cuenta una
          partida que jugaste sin haber entrado.
        </li>
        <li>
          <strong>Dirección IP:</strong> nunca la guardamos tal cual, solo un resumen (hash) que cambia cada día, para
          limitar abusos.
        </li>
        <li>
          <strong>Cuentas baneadas:</strong> si una cuenta se banea por trampas, guardamos una huella (hash) de su
          email y de su cuenta de Google para que no pueda volver a registrarse.
        </li>
      </ul>

      <h2>Para qué y con qué base legal</h2>
      <ul>
        <li>
          Darte el servicio (tu cuenta, tu perfil público, tu puesto en el ranking y la página de cada partida válida,
          que ve quien tenga su enlace): es la ejecución del contrato que aceptas al crear la cuenta.
        </li>
        <li>
          Validar las partidas y prevenir trampas y abusos (comprobar las pulsaciones, limitar partidas, verificar
          récords, sancionar cuentas e impedir que las baneadas vuelvan a registrarse): es nuestro interés legítimo en
          que el ranking sea justo y el servicio, seguro.
        </li>
      </ul>

      <h2>Cuánto tiempo</h2>
      <ul>
        <li>
          Pulsaciones: 30 días. Las de tu mejor marca en cada ranking se guardan mientras siga siéndolo, para poder
          revisarla.
        </li>
        <li>
          Antes de borrar las pulsaciones guardamos un extracto de su ritmo (tiempos entre teclas, sin texto, sin teclas y
          sin identificadores, con la velocidad y la precisión redondeadas), es decir, seudonimizado, para mejorar la
          detección de trampas. Se conserva sin plazo por nuestro interés legítimo en calibrar el antitrampas.
        </li>
        <li>
          Partidas: a los 30 días se borran el identificador anónimo y el resumen de la IP de todas las partidas, con cuenta
          o sin ella. De las partidas sin cuenta solo quedan las cifras, para estadísticas; las de tu cuenta siguen en ella
          hasta que la borres.
        </li>
        <li>
          Tu cuenta: hasta que la borres. Al borrarla eliminamos tu email, tu nick, tu país, tus sesiones, tus passkeys,
          tus marcas y las pulsaciones de tus partidas, y sales de los rankings; tus partidas quedan anónimas.
        </li>
        <li>Huellas de cuentas baneadas: sin plazo, mientras sean necesarias para prevenir el fraude.</li>
      </ul>

      <h2>Con quién los compartimos</h2>
      <p>
        No vendemos tus datos ni los usamos para publicidad. Los tratan por nuestra cuenta estos proveedores: Vercel
        (alojamiento y analítica sin cookies), Neon (base de datos), Upstash (datos temporales y rankings), Resend
        (envío de emails), Cloudflare (Turnstile, la comprobación anti-bots), Sentry (registro de errores del servidor)
        y Google, solo si entras con Google. Algunos están fuera de la Unión Europea, sobre todo en Estados Unidos: esas
        transferencias se hacen con las garantías de cada proveedor (cláusulas contractuales tipo o el Marco de
        Privacidad de Datos UE-EE. UU.).
      </p>

      <h2>Cookies</h2>
      <p>
        Solo usamos cookies estrictamente necesarias para que la web funcione: la de tu sesión, el identificador
        anónimo, la que recuerda que has pasado la comprobación anti-bots y la de tu idioma. No usamos cookies de
        publicidad ni de analítica, así que no te pedimos consentimiento. La analítica de Vercel no usa cookies.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes acceder a tus datos, corregirlos, borrarlos, oponerte a su tratamiento, limitarlo y pedir una copia. Para
        borrar tu cuenta y todos tus datos, usa «Borrar mi cuenta» en la página <Link href="/settings">Tu cuenta</Link>. Para lo
        demás, escríbenos a <a href={MAIL}>{PRIVACY_EMAIL}</a>. Si crees que no hemos tratado bien tus datos, puedes
        reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es">aepd.es</a>).
      </p>

      <h2>Edad mínima</h2>
      <p>Necesitas tener al menos 14 años para crear una cuenta.</p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, actualizaremos la fecha de arriba y, si el cambio es importante, te avisaremos.</p>
    </>
  );
}
