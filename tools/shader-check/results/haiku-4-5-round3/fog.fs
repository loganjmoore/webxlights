/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "fogColor", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float fogX = fract(uv.x + TIME * speed * 0.3);
  float fogY = uv.y;
  
  float fog = sin(fogX * 6.28318 + TIME * speed * 0.5) * 0.5 + 0.5;
  fog *= sin(fogY * 3.14159 + TIME * speed * 0.2) * 0.5 + 0.5;
  fog = pow(fog, 1.0 - density * 0.8);
  
  vec3 finalColor = fogColor.rgb * fog;
  float alpha = fog * density;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
