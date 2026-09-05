/*{
  "DESCRIPTION": "Classic warm white fairy lights sparkling gently, the way a tasteful house looks",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.82, 0.55, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sparkle", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 cell = floor(uv * RENDERSIZE);
  float t = mod(TIME * speed, 62.831853);
  float h = hash(cell);
  float h2 = hash(cell + 23.0);
  // Every bulb is on, warm, most of the time. A few at a time flare brighter for a moment:
  // that is what "sparkle" looks like on a real string, not bulbs switching off.
  float rate = 1.2 + 0.3 * floor(h2 * 3.0);
  float pulse = pow(0.5 + 0.5 * sin(t * rate + h * 6.2831853), 8.0);
  float lit = 0.68 + 0.32 * sparkle * pulse + 0.1 * (1.0 - sparkle);
  // A slow wave along the string so the whole thing breathes very slightly.
  lit *= 0.92 + 0.08 * sin(uv.x * 6.0 + t * 0.4);
  gl_FragColor = vec4(colorA.rgb * min(lit, 1.0), 1.0);
}
