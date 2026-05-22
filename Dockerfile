FROM nginx:1.27-alpine

COPY demo/ /usr/share/nginx/html/

# The exported prototype keeps its original filename; nginx serves index.html by default.
RUN cp "/usr/share/nginx/html/Incluvo Prototype.html" /usr/share/nginx/html/index.html

EXPOSE 80
