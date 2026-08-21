/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "fogColor", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 5.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float drift = TIME * speed * 0.3;
  
  float fog = 0.0;
  
  for(int i = 0; i < 4; i++) {
    float layer = fract((uv.x - drift * (0.5 + float(i) * 0.25)) / scale);
    float wave = sin(uv.y * 3.14159 * 2.0 * scale + float(i) * 1.57 + TIME * speed * 0.5) * 0.5 + 0.5;
    float noise = sin(layer * 12.566 + float(i) * 2.0) * 0.5 + 0.5;
    fog += noise * wave * 0.25;
  }
  
  fog = smoothstep(0.2, 0.8, fog * density);
  
  gl_FragColor = vec4(fogColor.rgb * fog, 1.0);
}
