# Estrategia de precios de TallaYa

Fecha: 2026-10-27 · Método: `/founder:pricing-strategy` (skill `co-founder-strategy`) adaptado a Cuba.
Estado: **recomendación**. Cambiar precios en producción o publicarlos es L2 (`co-approval-gates`).

> Las cifras de competidores y de tasas son **estimaciones** sin fuente pública fiable. Antes de
> publicar, poner la tasa del día con fecha y fuente (elTOQUE) y validar con 10-15 entrevistas.

## 1. Contexto

- **Producto**: tracker de gimnasio completo (rutinas, registro, progresión automática, récords,
  peso, mapa muscular, coach IA opcional) que **funciona sin conexión**. Base: openGym.
- **Coste por usuario**: casi cero. El dato vive en el teléfono; el servidor (Dokploy compartido)
  solo sincroniza un JSON por usuario. El único coste variable real es el **coach IA** (OpenRouter).
- **Mercado**: en Cuba casi nadie paga apps. Pero quien paga un **gimnasio particular** (cuota
  mensual en CUP, a veces en USD) ya gasta en entrenar, y el **entrenador personal** cobra por
  alumno. Ahí está el dinero.
- **Cobro**: no hay débito automático. Cada renovación es un pago manual. Eso empuja hacia
  **periodos largos** (trimestral, anual) y **precio fundador** que premie pagar por adelantado.

## 2. Modelos comparados

| Modelo | Pros | Contras | Veredicto |
|---|---|---|---|
| Pago único | Fácil de entender | No paga servidor ni IA a largo plazo | Solo como «Fundador vitalicio» limitado |
| Suscripción individual | Ingreso recurrente | Renovar a mano cada mes cansa | **Sí**, con trimestral y anual |
| Freemium | Crece por boca a boca | Pocos convierten | **Sí**: el núcleo es gratis (y AGPL) |
| Por alumno (B2B entrenador) | Paga quien gana dinero con la app | Venta más lenta | **Sí**: plan Entrenador |
| Por gimnasio (B2B) | Ticket alto, un pago cubre a muchos | Necesita funciones de gestión | **Sí**: plan Gimnasio |
| Publicidad | Gratis para el usuario | Choca con la marca y la privacidad | **No** |

## 3. Planes recomendados

Precio base en **USD**. CUP y MLC se calculan a la tasa del día (sección 5).

| | **Arranque** | **En Talla** | **Entrenador** | **Gimnasio** |
|---|---|---|---|---|
| Para quién | Todo el mundo | Quien entrena en serio | Entrenador personal | Gimnasio particular |
| Mensual | **Gratis** | **1,99 USD** | **7,99 USD** | **19,99 USD** |
| Trimestral | — | 4,99 USD (−16 %) | 19,99 USD | 49,99 USD |
| Anual | — | 14,99 USD (−37 %) | 69,99 USD | 179,99 USD |
| Rutinas, registro, biblioteca, sin conexión | ✓ | ✓ | ✓ | ✓ |
| Progresión automática y récords | Básica | Completa | Completa | Completa |
| Estadísticas, mapa muscular, medidas | Últimos 30 días | Todo el historial | Todo | Todo |
| Copia de seguridad en la nube y varios dispositivos | — | ✓ | ✓ | ✓ |
| Coach IA (mensajes al mes) | — | 60 | 300 | 1 000 compartidos |
| Iconos alternativos y temas | — | ✓ | ✓ | ✓ |
| Alumnos / socios | — | — | hasta 30 | hasta 200 + 5 entrenadores |
| Asignar rutinas y ver el avance de alumnos | — | — | ✓ | ✓ |
| Marca del gimnasio (logo y color en la app del socio) | — | — | — | ✓ |
| Control de cuotas de socios | — | — | — | ✓ (fase 2) |

Por qué estos números:

- **En Talla a 1,99 USD** queda por debajo de lo que cuesta un mes de un gimnasio particular
  barato. Es «un refresco al mes». El anual a 14,99 USD es el producto estrella: un solo pago al
  año, sin acordarse de renovar.
- **Entrenador a 7,99 USD**: con un solo alumno que pague su mensualidad ya se cubre. Ancla:
  30 alumnos = 0,27 USD por alumno.
- **Gimnasio a 19,99 USD**: menos de lo que cobra el gimnasio a **un** socio en muchos barrios.
- **El núcleo es gratis** por coherencia con la licencia AGPL y porque el boca a boca es el
  canal principal en Cuba.

### Prueba gratis

**7 días de En Talla** al crear la cuenta, sin pedir pago. Al acabar vuelve a Arranque sin perder
datos (los datos siempre son del usuario).

## 4. Precio Fundador (lanzamiento)

| Oferta | Precio | Límite | Regla |
|---|---|---|---|
| **Fundador En Talla** | **0,99 USD/mes** o **9,99 USD/año** | primeros 500 suscriptores | El precio se **congela** mientras renueve sin cortar más de 15 días. |
| **Fundador vitalicio** | **39,99 USD** pago único | 150 plazas | En Talla para siempre. Financia el arranque y la licencia de Gym visual. |
| **Entrenador fundador** | 4,99 USD/mes | primeros 50 entrenadores | Congelado 12 meses. Incluye página de entrenador destacada. |

Mostrar siempre el contador de plazas que quedan («quedan 212 de 500»): urgencia real, no falsa.

## 5. Monedas y conversión

- Fuente de verdad: **precio en USD**. Igual que en QvaArbi y FulaYa, el checkout muestra el
  importe en la moneda elegida a la **tasa del día**.
- `precio_CUP = redondear_arriba_a_50(precio_USD × tasa_CUP/USD)`
- `precio_MLC = redondear_arriba_a_0,50(precio_USD × tasa_MLC/USD)`
- La tasa se congela en el pedido (como `sell_pricing` en QvaArbi) para que el precio no cambie
  mientras el usuario paga.
- Ejemplo **solo ilustrativo** con una tasa hipotética de 500 CUP/USD: En Talla 1,99 USD →
  **1 000 CUP/mes**; anual 14,99 USD → **7 500 CUP**. Sustituir por la tasa real con fecha.
- Dinero en `Decimal`, nunca `float`. Importes en JSON como string. Dato ausente = «—».

## 6. Métodos de pago

Los mismos que ya usan QvaArbi y FulaYa, más tarjeta, cripto y saldo móvil.

| Método | Monedas | Cómo se confirma | Comisión aproximada | Qué paga el usuario |
|---|---|---|---|---|
| **Transfermóvil** | CUP, MLC | SMS del banco (app `qvaarbi-sms`) o comprobante | 0 % | Precio base |
| **EnZona** | CUP, MLC | Comprobante / SMS | 0 % | Precio base |
| **QvaPay** (saldo QUSD) | USD | Webhook de factura firmado | ~1 % (verificar) | Precio base |
| **Tarjeta Visa/Mastercard** (QvaPay, tick `CARD` / TopUp) | USD | Webhook de QvaPay | ~5 % (verificar) | Base + recargo mostrado antes de pagar |
| **PayPal** | USD | Webhook PayPal | ~5,4 % + 0,30 USD | Base + recargo mostrado antes de pagar |
| **Cripto** (TronDealer: USDT/USDC en TRON, BSC, Polygon, Solana…) | USD | Webhook on-chain firmado | ~1 % + red | Precio base (la red la paga el usuario) |
| **Saldo móvil** (QvaPay, tick `ETECSA`) | Saldo | Confirmación P2P de QvaPay | El saldo vale menos que el USD | Base × factor de saldo del día (p. ej. ×1,25) |

Reglas:

- **Ningún método se activa sin webhook firmado o confirmación verificable.** Igual que en la
  mini-app de QvaArbi: el frontend muestra «Procesando…» y solo la confirmación activa el plan.
- El recargo por método se muestra **antes** de pagar, con su porcentaje. Nada de sorpresas.
- **Reutilizar** el motor de cobro de QvaArbi (checkout por pasos, matriz método × moneda en
  admin, TronDealer, facturas QvaPay) en vez de escribirlo de cero: ver
  `qvapay-arbi/spec/spec-architecture-saas-billing-payments.md` y
  `spec-architecture-crypto-payments-trondealer.md`.
- Transfermóvil y EnZona: confirmación automática con el lector de SMS (`qvaarbi-sms`) en el
  teléfono del negocio; si el SMS no llega, revisión manual con comprobante.

## 7. Economía por usuario (estimación)

| Concepto | En Talla mensual | En Talla anual |
|---|---|---|
| Ingreso | 1,99 USD | 1,25 USD/mes |
| Servidor (sincronización JSON) | ~0,01 USD | ~0,01 USD |
| Coach IA (60 mensajes, modelo barato en OpenRouter) | ~0,06 USD | ~0,06 USD |
| Comisión de cobro (peor caso, PayPal) | ~0,41 USD | ~0,10 USD/mes |
| **Margen bruto** | **~76 %** | **~86 %** |

Licencia de animaciones de Gym visual: coste fijo a confirmar. Debe cubrirse con las ventas de
Fundador vitalicio antes del lanzamiento.

## 8. Métricas a vigilar (primeros 90 días)

1. Activación: % que registra 3 entrenos la primera semana.
2. Conversión de prueba (7 días) a pago.
3. Mezcla de periodos: % anual vs. mensual (objetivo > 50 % anual).
4. Renovación a tiempo (sin corte de más de 15 días).
5. Entrenadores activos y alumnos por entrenador.

## 9. Próximos pasos

1. Confirmar nombre y licencias (ver `docs/marca/nombre-tallaya.md`).
2. 10-15 entrevistas: 5 socios de gimnasio, 5 entrenadores, 3 dueños de gimnasio. Preguntar qué
   pagan hoy y cómo, no si «pagarían».
3. Página de precios con selector CUP/MLC/USD y contador de plazas Fundador.
4. Conectar el checkout reutilizando el de QvaArbi.
