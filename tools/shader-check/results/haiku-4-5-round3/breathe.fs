/*{
  "DESCRIPTION": "Slow breathing glow that fades in and out smoothly",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "glowColor", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "breatheSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "darkLevel", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float dist = length(uv - vec2(0.5, 0.5));
  float breathe = 0.5 + 0.5 * sin(TIME * breatheSpeed * 3.14159265);
  float intensity = mix(darkLevel, 1.0, breathe);
  float glow = smoothstep(0.8, 0.0, dist);
  gl_FragColor = vec4(glowColor.rgb * intensity * glow, 1.0);
}
