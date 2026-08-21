/*{
  "DESCRIPTION": "A repeating colored chase that runs along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "count", "TYPE": "long", "MIN": 1, "MAX": 64, "DEFAULT": 8 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.12 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.25 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // Drive along X for rooflines; if the buffer is very tall, still use X so the chase reads on a roofline.
  float pos = uv.x;

  // Safeguard for division and counts
  float fCount = max(float(count), 1.0);

  // Movement: speed controls how fast the chase marches; loop is seamless due to fract()
  float move = TIME * (speed * 0.25);

  // Each pulse occupies one segment out of fCount across X
  float seg = fract(pos * fCount - move);

  // Distance from center of a segment (0.5 is the center)
  float dist = abs(seg - 0.5);

  // Pulse width and edge softness
  float halfW = clamp(width * 0.5, 0.001, 0.5);
  float edge = clamp(softness, 0.0, 1.0) * halfW;

  // Intensity shaped by smoothstep for soft edges; peak at center
  float intensity = 1.0 - smoothstep(halfW - edge, halfW + edge, dist);

  // Add a small sheen that travels with the chase for a lively effect
  float sheen = 0.15 * sin( (pos * fCount - move) * 6.283185 + TIME * 6.283185 );
  intensity = clamp(intensity + sheen * intensity, 0.0, 1.0);

  // High contrast mixing between background and chase color
  vec3 col = mix(colorB.rgb, colorA.rgb, intensity);

  // Slight global dim to keep black truly off when background is chosen black
  float globalBoost = 1.0;
  col *= globalBoost;

  gl_FragColor = vec4(col, 1.0);
}
