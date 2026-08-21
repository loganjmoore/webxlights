/*{
  "DESCRIPTION": "A slow breathing glow that pulses between two colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.05, 0.2, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.5 },
    { "NAME": "minGlow", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  float breath = 0.5 + 0.5 * sin(TIME * speed * 0.8);
  breath = smoothstep(0.0, 1.0, breath);
  float glow = mix(minGlow, 1.0, breath);

  vec3 col = mix(colorA.rgb, colorB.rgb, breath);
  col *= glow;

  gl_FragColor = vec4(col, 1.0);
}
