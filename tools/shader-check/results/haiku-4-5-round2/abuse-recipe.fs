/*{
  "DESCRIPTION": "Warm chocolate and golden cookie colors swirl and pulse across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "chocolate", "TYPE": "color", "DEFAULT": [0.4, 0.2, 0.0, 1.0] },
    { "NAME": "cookie", "TYPE": "color", "DEFAULT": [0.9, 0.7, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 10.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float h = RENDERSIZE.y;
  if (h < 2.0) {
    uv.y = uv.x;
  }
  
  float wave1 = sin(uv.x * scale + TIME * speed) * 0.5 + 0.5;
  float wave2 = sin(uv.y * scale * 0.7 + TIME * speed * 0.8) * 0.5 + 0.5;
  float pulse = sin(TIME * speed * 0.5) * 0.5 + 0.5;
  
  float blend = mix(wave1, wave2, 0.5) * pulse;
  
  gl_FragColor = vec4(mix(chocolate.rgb, cookie.rgb, blend), 1.0);
}
