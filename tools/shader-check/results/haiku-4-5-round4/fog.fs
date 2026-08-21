/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "fogColor", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float fog = 0.0;
  
  for (int i = 0; i < 8; i++) {
    float layer = float(i) * 0.125;
    float wave = sin(uv.x * 3.0 + TIME * speed * 0.5 + layer * 6.28) * 0.5 + 0.5;
    wave *= cos(uv.y * 2.0 + TIME * speed * 0.3 + layer * 3.14) * 0.5 + 0.5;
    fog += wave * (1.0 - layer) * 0.125;
  }
  
  fog = pow(fog, 1.0 / (density + 0.5));
  fog = smoothstep(0.1, 0.8, fog);
  
  vec3 finalColor = mix(vec3(0.0), fogColor.rgb, fog);
  gl_FragColor = vec4(finalColor, 1.0);
}
