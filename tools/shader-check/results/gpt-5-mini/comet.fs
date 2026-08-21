/*{
  "DESCRIPTION": "Comet circling with a long tail",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 6.0, "DEFAULT": 3.0 },
    { "NAME": "headSize", "TYPE": "float", "MIN": 0.001, "MAX": 0.5, "DEFAULT": 0.03 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float TWO_PI = 6.28318531;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float angSpeed = speed * 0.25 * TWO_PI; // controls orbital period
  float theta = TIME * angSpeed;

  // clamp user params into safe ranges
  float tLen = clamp(tailLength, 0.1, 6.28318531);
  float hSize = max(headSize, 0.001);
  float soft = clamp(softness, 0.0, 1.0);

  vec3 col = vec3(0.0, 0.0, 0.0);

  if (RENDERSIZE.y < 2.0) {
    // single-row / roofline: project the orbit so motion is visible along X
    // center X at 0.5, use a horizontal excursion
    float radiusX = 0.45;
    float cometX = 0.5 + cos(theta) * radiusX;
    // motion direction along x:
    float dxdt = -sin(theta) * radiusX * angSpeed;
    float movingRight = step(0.0, dxdt); // 1.0 when moving right, 0.0 when moving left

    // head intensity (1D distance)
    float headDist = abs(uv.x - cometX);
    float head = smoothstep(hSize * 1.5, 0.0, headDist);

    // tail: measure how far behind along x the pixel is
    // behindVal positive when pixel is behind comet in motion direction
    float behindVal = (cometX - uv.x) * (movingRight * 1.0 + (1.0 - movingRight) * -1.0);
    float tailRange = tLen * 0.08; // interpret tailLength as screen fraction scale here
    tailRange = max(tailRange, 0.01);
    float tnorm = clamp(behindVal / tailRange, 0.0, 1.0);
    float tail = pow(1.0 - tnorm, 2.0);
    // radial falloff for any vertical deviation (small line height)
    float radialFall = exp(-abs(uv.y - 0.5) * 30.0);
    tail *= radialFall * (1.0 - soft * 0.7);

    // color mix: head is colorA, tail is colorB
    col += colorB.rgb * tail;
    col += colorA.rgb * head * 1.6;
  } else {
    // full 2D circular orbit
    // transform coordinates so a circle looks round regardless of aspect
    vec2 centered = (uv - vec2(0.5, 0.5)) * vec2(aspect, 1.0);
    float radius = 0.35 * min(aspect, 1.0);
    vec2 cometPos = vec2(cos(theta), sin(theta)) * radius;
    float r = length(centered);
    float angleP = atan(centered.y, centered.x);

    // how far behind the pixel is, in radians (0..TWO_PI)
    float dtheta = mod(theta - angleP + TWO_PI, TWO_PI);

    // head brightness based on distance to comet core
    float headDist = distance(centered, cometPos);
    float head = smoothstep(hSize * 1.5, 0.0, headDist);

    // tail radial thickness
    float tailWidth = hSize * (1.0 + 6.0 * (1.0 - soft));
    tailWidth = max(tailWidth, 0.001);

    float radialDiff = abs(r - radius);
    float tailRadial = smoothstep(tailWidth, 0.0, radialDiff);

    // angular falloff along orbit: stronger near the comet, fading with angle
    float tailAngular = 1.0 - smoothstep(0.0, tLen, dtheta);
    float dnorm = clamp(dtheta / tLen, 0.0, 1.0);
    float tail = tailAngular * tailRadial * pow(1.0 - dnorm, 2.0);

    // subtle inner glow of the tail closer to the orbit center
    float innerGlow = smoothstep(radius * 0.7, radius * 0.3, r) * 0.2;

    col += colorB.rgb * tail * (1.0 + innerGlow);
    col += colorA.rgb * head * 1.6;
  }

  // final tone mapping and clamp for strong festive look
  col = 1.0 - exp(-col * 2.0); // simple soft light amplification
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
